/**
 * Comment Auto-Moderation
 *
 * Handles automatic moderation actions triggered from the webhook flow.
 * Currently supports: auto-hide of negative comments.
 *
 * Design principles:
 * - Idempotent: checks for existing HIDE log before acting
 * - Audit-complete: every decision is logged via actionLogger
 * - Non-blocking: errors are caught and logged, never rethrown
 */

import { prisma } from './prisma';
import { createActionLog, updateActionLog } from './actionLogger';
import { graphFetch } from './graphFetch';

const META_GRAPH_BASE = 'https://graph.facebook.com/v24.0';

export type NegativeActionMode = 'hide' | 'delete';

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

    // Idempotency: skip if a HIDE action log already exists for this comment
    const existingHideLog = await prisma.commentActionLog.findFirst({
      where: { commentId: commentDbId, actionType: 'HIDE' },
      select: { id: true },
    });

    if (existingHideLog) {
      console.log(`[Moderation] HIDE log already exists for comment ${commentDbId} — skipping duplicate`);
      return;
    }

    // Create PENDING action log before calling the API
    const logId = await createActionLog({
      commentId: commentDbId,
      connectedPageId,
      provider,
      actionType: 'HIDE',
      status: 'PENDING',
      reason: 'Auto-hide: negative sentiment detected',
      ruleTriggered: 'auto_hide_negative',
    });

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

        await prisma.comment.update({
          where: { id: commentDbId },
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

      await prisma.comment.update({
        where: { id: commentDbId },
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

  // Idempotency: skip if a DELETE action log already exists for this comment
  const existingDeleteLog = await prisma.commentActionLog.findFirst({
    where: { commentId: commentDbId, actionType: 'DELETE' },
    select: { id: true },
  });

  if (existingDeleteLog) {
    console.log(`[Moderation] DELETE log already exists for comment ${commentDbId} — skipping duplicate`);
    return;
  }

  const deleteLogId = await createActionLog({
    commentId: commentDbId,
    connectedPageId,
    provider,
    actionType: 'DELETE',
    status: 'PENDING',
    reason: 'Auto-delete: negative sentiment detected',
    ruleTriggered: 'auto_delete_negative',
  });

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

      await prisma.comment.update({
        where: { id: commentDbId },
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

    await prisma.comment.update({
      where: { id: commentDbId },
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
