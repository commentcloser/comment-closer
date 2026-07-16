/**
 * Comment Auto-Moderation
 *
 * Handles automatic moderation actions triggered from the webhook flow.
 * Currently supports: auto-hide of negative comments.
 *
 * Design principles:
 * - Idempotent: atomically claims the action log before acting
 * - Audit-complete: every decision is logged via actionLogger
 * - Non-blocking: errors are caught and logged, never rethrown
 */

import { prisma } from './prisma';
import { updateActionLog } from './actionLogger';
import { graphFetch } from './graphFetch';

const META_GRAPH_BASE = 'https://graph.facebook.com/v24.0';

export type NegativeActionMode = 'hide' | 'delete';

/**
 * Claim an auto-moderation action for a comment.
 *
 * Two guards, because neither covers the other's case:
 *  1. The existing-log check catches a redelivery that arrives after a previous
 *     attempt finished. It is NOT atomic on its own.
 *  2. The create is the atomic tiebreaker for deliveries racing inside that
 *     window: the unique [commentId, actionType] constraint lets exactly one
 *     caller win, and the loser (P2002) bails instead of firing a second Graph
 *     call. Do not drop guard 1 in favour of this — the constraint is declared
 *     in schema.prisma but no migration creates it, so it is absent on any DB
 *     provisioned by `prisma migrate deploy` rather than `prisma db push`.
 *
 * Returns the new PENDING log ID, or null when the action is already claimed.
 */
async function claimModerationAction(params: {
  commentDbId: string;
  connectedPageId: string;
  provider: 'facebook' | 'instagram';
  actionType: 'HIDE' | 'DELETE';
  reason: string;
  ruleTriggered: string;
}): Promise<string | null> {
  const existingLog = await prisma.commentActionLog.findFirst({
    where: { commentId: params.commentDbId, actionType: params.actionType },
    select: { id: true },
  });

  if (existingLog) {
    console.log(`[Moderation] ${params.actionType} log already exists for comment ${params.commentDbId} — skipping duplicate`);
    return null;
  }

  try {
    const log = await prisma.commentActionLog.create({
      data: {
        commentId: params.commentDbId,
        connectedPageId: params.connectedPageId,
        provider: params.provider,
        actionType: params.actionType,
        status: 'PENDING',
        reason: params.reason,
        ruleTriggered: params.ruleTriggered,
      },
      select: { id: true },
    });

    console.log(`📝 [Action Log] Created: ${params.actionType} - PENDING | Log ID: ${log.id}`);

    return log.id;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      console.log(`[Moderation] ${params.actionType} log already exists for comment ${params.commentDbId} — skipping duplicate`);
      return null;
    }

    console.error(`❌ [Action Log] Failed to create:`, error?.message);
    throw error;
  }
}

/**
 * Auto-moderate a negative comment via the Meta Graph API.
 *
 * Supports two modes:
 * - 'hide'   → hides the comment (current behaviour)
 * - 'delete' → deletes the comment on Meta but keeps a record in our DB
 *
 * Called from both the Facebook and Instagram webhook handlers immediately
 * after sentiment is saved. Guards against:
 *  - Non-negative sentiment (no-op)
 *  - Moderation disabled at page level (no-op)
 *  - Duplicate logs for the same action (idempotency)
 */
export async function autoModerateNegativeComment({
  mode,
  commentDbId,
  commentMetaId,
  connectedPageId,
  provider,
  pageAccessToken,
  autoModerationEnabled,
  autoHideNegativeEnabled,
  sentiment,
}: {
  mode: NegativeActionMode;
  commentDbId: string;
  commentMetaId: string;
  connectedPageId: string;
  provider: 'facebook' | 'instagram';
  pageAccessToken: string;
  autoModerationEnabled: boolean;
  autoHideNegativeEnabled?: boolean;
  sentiment: string;
}): Promise<void> {
  // Only act on negative comments when moderation is enabled
  if (sentiment !== 'negative' || !autoModerationEnabled) {
    return;
  }

  const effectiveMode: NegativeActionMode = mode || 'hide';

  if (effectiveMode === 'hide') {
    // Optional guard: require the legacy autoHideNegativeEnabled flag when provided
    if (autoHideNegativeEnabled === false) {
      return;
    }

    console.log(`🛑 [Moderation] DECISION: HIDE | Comment DB ID: ${commentDbId} | Provider: ${provider}`);

    // Idempotency: atomically claim the HIDE (and log it PENDING) before calling the API
    const logId = await claimModerationAction({
      commentDbId,
      connectedPageId,
      provider,
      actionType: 'HIDE',
      reason: 'Auto-hide: negative sentiment detected',
      ruleTriggered: 'auto_hide_negative',
    });

    if (!logId) {
      return;
    }

    // Call Meta Graph API to hide the comment
    const hideUrl = `${META_GRAPH_BASE}/${commentMetaId}`;

    try {
      // Facebook uses `is_hidden`, Instagram uses `hide`
      const hideParam = provider === 'instagram' ? { hide: true } : { is_hidden: true };

      const response = await fetch(hideUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...hideParam,
          access_token: pageAccessToken,
        }),
      });

      if (response.ok) {
        const responseData = await response.json();

        console.log(`✅ [Moderation] HIDE success | Comment DB ID: ${commentDbId}`);

        await prisma.comment.update({
          where: { id: commentDbId },
          data: {
            hiddenAt: new Date(),
            automationStatus: 'moderated',
            needsReview: false,
            lastError: null,
          },
        });

        await updateActionLog({
          logId,
          status: 'SUCCESS',
          metaResponse: responseData,
        });
      } else {
        const errorText = await response.text();

        console.error(`❌ [Moderation] HIDE failed | Comment DB ID: ${commentDbId} | Status: ${response.status} | Error: ${errorText}`);

        // Guarded: never downgrade a comment a concurrent delivery already hid
        await prisma.comment.updateMany({
          where: { id: commentDbId, hiddenAt: null },
          data: {
            needsReview: true,
            automationStatus: 'failed',
            lastError: `Auto-hide failed (${response.status}): ${errorText.substring(0, 200)}`,
          },
        });

        await updateActionLog({
          logId,
          status: 'FAILED',
          errorMessage: errorText,
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';

      console.error(`❌ [Moderation] HIDE exception | Comment DB ID: ${commentDbId} | Error: ${errorMessage}`);

      // Guarded: never downgrade a comment a concurrent delivery already hid
      await prisma.comment.updateMany({
        where: { id: commentDbId, hiddenAt: null },
        data: {
          needsReview: true,
          automationStatus: 'failed',
          lastError: `Auto-hide exception: ${errorMessage}`,
        },
      });

      await updateActionLog({
        logId,
        status: 'FAILED',
        errorMessage: errorMessage,
      });
    }

    return;
  }

  // === DELETE MODE ===
  console.log(`🛑 [Moderation] DECISION: DELETE | Comment DB ID: ${commentDbId} | Provider: ${provider}`);

  // Idempotency: atomically claim the DELETE (and log it PENDING) before calling the API
  const deleteLogId = await claimModerationAction({
    commentDbId,
    connectedPageId,
    provider,
    actionType: 'DELETE',
    reason: 'Auto-delete: negative sentiment detected',
    ruleTriggered: 'auto_delete_negative',
  });

  if (!deleteLogId) {
    return;
  }

  const deleteUrl = `${META_GRAPH_BASE}/${commentMetaId}?access_token=${encodeURIComponent(pageAccessToken)}`;

  try {
    const response = await graphFetch(deleteUrl, undefined, {
      method: 'DELETE',
    });

    if (response.ok) {
      let metaResponse: any = null;
      try {
        metaResponse = await response.json();
      } catch {
        // DELETE responses can be empty / non-JSON; ignore parse errors
      }

      console.log(`✅ [Moderation] DELETE success | Comment DB ID: ${commentDbId}`);

      // IMPORTANT: keep the comment in our DB, just mark as deleted
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          deletedAt: new Date(),
          automationStatus: 'moderated',
          needsReview: false,
          lastError: null,
        },
      });

      await updateActionLog({
        logId: deleteLogId,
        status: 'SUCCESS',
        metaResponse,
      });
    } else {
      const errorText = await response.text();

      console.error(`❌ [Moderation] DELETE failed | Comment DB ID: ${commentDbId} | Status: ${response.status} | Error: ${errorText}`);

      // Guarded: never downgrade a comment a concurrent delivery already deleted
      await prisma.comment.updateMany({
        where: { id: commentDbId, deletedAt: null },
        data: {
          needsReview: true,
          automationStatus: 'failed',
          lastError: `Auto-delete failed (${response.status}): ${errorText.substring(0, 200)}`,
        },
      });

      await updateActionLog({
        logId: deleteLogId,
        status: 'FAILED',
        errorMessage: errorText,
      });
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';

    console.error(`❌ [Moderation] DELETE exception | Comment DB ID: ${commentDbId} | Error: ${errorMessage}`);

    // Guarded: never downgrade a comment a concurrent delivery already deleted
    await prisma.comment.updateMany({
      where: { id: commentDbId, deletedAt: null },
      data: {
        needsReview: true,
        automationStatus: 'failed',
        lastError: `Auto-delete exception: ${errorMessage}`,
      },
    });

    await updateActionLog({
      logId: deleteLogId,
      status: 'FAILED',
      errorMessage: errorMessage,
    });
  }
}

/**
 * Backwards-compatible wrapper that preserves the original API for callers
 * still using autoHideNegativeComment directly.
 */
export async function autoHideNegativeComment(params: {
  commentDbId: string;
  commentMetaId: string;
  connectedPageId: string;
  provider: 'facebook' | 'instagram';
  pageAccessToken: string;
  autoModerationEnabled: boolean;
  autoHideNegativeEnabled: boolean;
  sentiment: string;
}): Promise<void> {
  const { autoHideNegativeEnabled, ...rest } = params;
  return autoModerateNegativeComment({
    mode: 'hide',
    autoHideNegativeEnabled,
    ...rest,
  });
}
