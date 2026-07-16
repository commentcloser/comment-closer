/**
 * Comment Action Logger
 * 
 * Provides audit trail and safety logging for all comment automation actions.
 * Every decision and action is logged for traceability and debugging.
 * 
 * Design Principles:
 * - Idempotent: Safe to call multiple times
 * - Traceable: Every action has a log entry
 * - Atomic: Action + log update happen together
 * - Fail-safe: Errors are logged, not swallowed
 */

import { prisma } from './prisma';

// ============================================================
// TYPES
// ============================================================

export type ActionType = 
  | 'REPLY' 
  | 'HIDE' 
  | 'DELETE' 
  | 'SKIP' 
  | 'MANUAL_REPLY' 
  | 'MANUAL_HIDE' 
  | 'MANUAL_IGNORE';

export type ActionStatus = 
  | 'PENDING' 
  | 'SUCCESS' 
  | 'FAILED' 
  | 'SKIPPED';

export type AutomationStatus = 
  | 'pending' 
  | 'replied' 
  | 'skipped' 
  | 'failed'
  | 'moderated';

export interface CreateActionLogParams {
  commentId: string;
  connectedPageId: string;
  provider: 'facebook' | 'instagram' | 'tiktok' | 'tiktok_ads';
  actionType: ActionType;
  status: ActionStatus;
  reason?: string;
  ruleTriggered?: string;
  aiPromptVersion?: string;
  aiModel?: string;
  aiReplyText?: string;
  metaResponse?: any;
  errorMessage?: string;
  webUsed?: boolean;
  webDomain?: string;
  promptSource?: string;
}

export interface UpdateActionLogParams {
  logId: string;
  status: ActionStatus;
  metaResponse?: any;
  errorMessage?: string;
  webUsed?: boolean;
  webDomain?: string;
  promptSource?: string;
}

// ============================================================
// CORE LOGGING FUNCTIONS
// ============================================================

/**
 * Create an action log entry
 * Returns the created log ID for later updates
 */
export async function createActionLog(
  params: CreateActionLogParams
): Promise<string> {
  try {
    const log = await prisma.commentActionLog.create({
      data: {
        commentId: params.commentId,
        connectedPageId: params.connectedPageId,
        provider: params.provider,
        actionType: params.actionType,
        status: params.status,
        reason: params.reason,
        ruleTriggered: params.ruleTriggered,
        aiPromptVersion: params.aiPromptVersion,
        aiModel: params.aiModel,
        aiReplyText: params.aiReplyText,
        metaResponse: params.metaResponse,
        errorMessage: params.errorMessage,
        webUsed: params.webUsed,
        webDomain: params.webDomain,
        promptSource: params.promptSource,
      },
    });
    
    console.log(`📝 [Action Log] Created: ${params.actionType} - ${params.status} | Log ID: ${log.id}`);
    
    return log.id;
  } catch (error: any) {
    // If unique constraint fails, it means action already logged (idempotent)
    if (error.code === 'P2002') {
      console.log(`📝 [Action Log] Already exists: ${params.actionType} for comment ${params.commentId}`);
      
      // Fetch existing log ID
      const existing = await prisma.commentActionLog.findFirst({
        where: {
          commentId: params.commentId,
          actionType: params.actionType,
        },
        select: { id: true },
      });
      
      return existing?.id || '';
    }
    
    console.error(`❌ [Action Log] Failed to create:`, error.message);
    throw error;
  }
}

/**
 * Update an existing action log with result
 */
export async function updateActionLog(
  params: UpdateActionLogParams
): Promise<void> {
  try {
    await prisma.commentActionLog.update({
      where: { id: params.logId },
      data: {
        status: params.status,
        metaResponse: params.metaResponse,
        errorMessage: params.errorMessage,
        ...(params.webUsed !== undefined && { webUsed: params.webUsed }),
        ...(params.webDomain !== undefined && { webDomain: params.webDomain }),
        ...(params.promptSource !== undefined && { promptSource: params.promptSource }),
      },
    });
    
    console.log(`📝 [Action Log] Updated: ${params.logId} → ${params.status}`);
  } catch (error: any) {
    console.error(`❌ [Action Log] Failed to update ${params.logId}:`, error.message);
    // Don't throw - log update failure shouldn't break the flow
  }
}

// ============================================================
// COMMENT STATE UPDATES
// ============================================================

/**
 * Update comment automation state after skip decision
 */
export async function updateCommentSkipped(
  commentId: string,
  ruleTriggered: string
): Promise<void> {
  // Only downgrade automationStatus from a non-terminal state. Idempotency skips
  // (already_replied / sentiment_negative) re-fire on routine Meta webhook
  // redeliveries and edits, and overwriting 'replied'/'moderated'/'failed' with
  // 'skipped' loses the outcome — the dashboard keys "Auto Hidden"/"Auto Deleted"
  // off automationStatus === 'moderated' and would show "Manual Hidden" instead.
  const { count } = await prisma.comment.updateMany({
    where: {
      id: commentId,
      OR: [
        { automationStatus: null },
        { automationStatus: { in: ['pending', 'skipped'] } },
      ],
    },
    data: {
      automationStatus: 'skipped',
      aiSkipReason: ruleTriggered,
    },
  });

  if (count === 0) {
    // Terminal state — preserve it, but still record why the reply was skipped.
    await prisma.comment.update({
      where: { id: commentId },
      data: { aiSkipReason: ruleTriggered },
    });

    console.log(`🔄 [State] Comment ${commentId} → skip logged (${ruleTriggered}), automationStatus preserved`);
    return;
  }

  console.log(`🔄 [State] Comment ${commentId} → skipped (${ruleTriggered})`);
}

/**
 * Update comment state before attempting action
 */
export async function updateCommentPending(
  commentId: string
): Promise<void> {
  await prisma.comment.update({
    where: { id: commentId },
    data: {
      automationStatus: 'pending',
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  
  console.log(`🔄 [State] Comment ${commentId} → pending (attempt incrementing)`);
}

/**
 * Update comment state after successful reply
 */
export async function updateCommentReplied(
  commentId: string,
  replyMessage: string
): Promise<void> {
  await prisma.comment.update({
    where: { id: commentId },
    data: {
      replied: true,
      repliedAt: new Date(),
      replyMessage: replyMessage,
      automationStatus: 'replied',
      status: 'replied',
      needsReview: false,
      lastError: null,
    },
  });
  
  console.log(`✅ [State] Comment ${commentId} → replied`);
}

/**
 * Update comment state after failed action
 */
export async function updateCommentFailed(
  commentId: string,
  errorMessage: string
): Promise<void> {
  await prisma.comment.update({
    where: { id: commentId },
    data: {
      // NOTE: `status` is deliberately left as-is. Moving it to 'ai_failed' would
      // be semantically tidier, but it strands the row: the AI-reply card, the
      // needs_review inbox filter and approve-reply all gate on 'ai_generated',
      // and the manual Reply composer is hidden for nested replies (isReply), so
      // a post-failed reply would have no recovery path at all. Keeping
      // 'ai_generated' preserves the Approve button, which re-posts the reply.
      // The decision engine excludes automationStatus 'failed' from its in-flight
      // counts instead, so a never-posted reply no longer blocks the author's
      // cooldown / thread cap forever.
      automationStatus: 'failed',
      needsReview: true,
      lastError: errorMessage,
    },
  });

  console.log(`❌ [State] Comment ${commentId} → failed (needs review)`);
}

/**
 * Update comment state for manual action
 */
export async function updateCommentManualAction(
  commentId: string,
  actionType: ActionType
): Promise<void> {
  const updates: any = {
    needsReview: false,
    lastError: null,
  };
  
  if (actionType === 'MANUAL_REPLY') {
    updates.replied = true;
    updates.repliedAt = new Date();
    updates.automationStatus = 'replied';
    updates.status = 'replied';
  } else if (actionType === 'MANUAL_HIDE') {
    updates.hiddenAt = new Date();
  } else if (actionType === 'MANUAL_IGNORE') {
    updates.status = 'ignored';
    updates.automationStatus = 'skipped';
  }
  
  await prisma.comment.update({
    where: { id: commentId },
    data: updates,
  });
  
  console.log(`🔄 [State] Comment ${commentId} → manual ${actionType}`);
}

// ============================================================
// HIGH-LEVEL WORKFLOW FUNCTIONS
// ============================================================

/**
 * Log a SKIP decision (from decision engine)
 */
export async function logSkipDecision(
  commentId: string,
  connectedPageId: string,
  provider: 'facebook' | 'instagram' | 'tiktok' | 'tiktok_ads',
  ruleTriggered: string,
  reason: string
): Promise<void> {
  // Create skip log
  await createActionLog({
    commentId,
    connectedPageId,
    provider,
    actionType: 'SKIP',
    status: 'SKIPPED',
    reason,
    ruleTriggered,
  });
  
  // Update comment state
  await updateCommentSkipped(commentId, ruleTriggered);
}

/**
 * Log reply action (call before posting to Meta API)
 * Returns log ID for later update with result
 */
export async function logReplyAttempt(
  commentId: string,
  connectedPageId: string,
  provider: 'facebook' | 'instagram' | 'tiktok' | 'tiktok_ads',
  aiReplyText: string,
  aiPromptVersion: string,
  aiModel: string,
  options?: { webUsed?: boolean; webDomain?: string; promptSource?: string }
): Promise<string> {
  // Update comment to pending
  await updateCommentPending(commentId);
  
  // Create pending log
  const logId = await createActionLog({
    commentId,
    connectedPageId,
    provider,
    actionType: 'REPLY',
    status: 'PENDING',
    reason: 'AI-generated reply',
    aiPromptVersion,
    aiModel,
    aiReplyText,
    webUsed: options?.webUsed,
    webDomain: options?.webDomain,
    promptSource: options?.promptSource,
  });
  
  return logId;
}

/**
 * Log successful reply
 */
export async function logReplySuccess(
  logId: string,
  commentId: string,
  replyMessage: string,
  metaResponse: any,
  options?: { webUsed?: boolean; webDomain?: string; promptSource?: string }
): Promise<void> {
  // Update log
  await updateActionLog({
    logId,
    status: 'SUCCESS',
    metaResponse,
    webUsed: options?.webUsed,
    webDomain: options?.webDomain,
    promptSource: options?.promptSource,
  });
  
  // Update comment state
  await updateCommentReplied(commentId, replyMessage);
}

/**
 * Log failed reply
 */
export async function logReplyFailure(
  logId: string,
  commentId: string,
  errorMessage: string
): Promise<void> {
  // Update log
  await updateActionLog({
    logId,
    status: 'FAILED',
    errorMessage,
  });
  
  // Update comment state
  await updateCommentFailed(commentId, errorMessage);
}

/**
 * Log manual action
 */
export async function logManualAction(
  commentId: string,
  connectedPageId: string,
  provider: 'facebook' | 'instagram' | 'tiktok' | 'tiktok_ads',
  actionType: ActionType,
  reason: string,
  metaResponse?: any
): Promise<void> {
  // Create log
  await createActionLog({
    commentId,
    connectedPageId,
    provider,
    actionType,
    status: 'SUCCESS',
    reason,
    metaResponse,
  });
  
  // Update comment state
  await updateCommentManualAction(commentId, actionType);
}

// ============================================================
// SAFETY CHECKS
// ============================================================

/**
 * Check if action is safe to perform (idempotency)
 */
export async function isActionSafe(
  commentId: string,
  actionType: ActionType
): Promise<{ safe: boolean; reason?: string }> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      replied: true,
      hiddenAt: true,
      deletedAt: true,
      automationStatus: true,
    },
  });
  
  if (!comment) {
    return { safe: false, reason: 'Comment not found' };
  }
  
  // Check for REPLY action
  if (actionType === 'REPLY' || actionType === 'MANUAL_REPLY') {
    if (comment.replied) {
      return { safe: false, reason: 'Already replied' };
    }
  }
  
  // Check for HIDE action
  if (actionType === 'HIDE' || actionType === 'MANUAL_HIDE') {
    if (comment.hiddenAt) {
      return { safe: false, reason: 'Already hidden' };
    }
  }
  
  // Check for DELETE action
  if (actionType === 'DELETE') {
    if (comment.deletedAt) {
      return { safe: false, reason: 'Already deleted' };
    }
  }
  
  return { safe: true };
}

// ============================================================
// ANALYTICS QUERIES
// ============================================================

/**
 * Get action log summary for a page
 */
export async function getActionLogsSummary(connectedPageId: string) {
  const logs = await prisma.commentActionLog.groupBy({
    by: ['actionType', 'status'],
    where: { connectedPageId },
    _count: true,
  });
  
  return logs;
}

/**
 * Get comments needing review
 */
export async function getCommentsNeedingReview(connectedPageId: string) {
  return await prisma.comment.findMany({
    where: {
      pageId: connectedPageId,
      needsReview: true,
    },
    orderBy: {
      lastAttemptAt: 'desc',
    },
    take: 50,
  });
}
