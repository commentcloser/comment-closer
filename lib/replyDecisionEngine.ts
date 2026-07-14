/**
 * AI Reply Decision Engine
 * 
 * Strict rule-based system to determine if an AI reply should be generated.
 * This layer runs BEFORE generateAIReply() and BEFORE posting.
 * 
 * Design Principles:
 * - Deterministic: Same inputs always produce same output
 * - Early exit: Stop at first failing rule
 * - Idempotent: Safe to call multiple times
 * - No side effects: Only reads DB, doesn't write
 */

import { prisma } from './prisma';

// ============================================================
// TYPES
// ============================================================

export interface ReplyDecisionConfig {
  commentDbId: string;           // Internal DB ID
  sentiment: string;             // "positive", "neutral", "negative"
  commentMessage: string;        // Full comment text
  authorId: string | null;       // Social media author ID
  pageId: string;                // ConnectedPage DB ID
  createdAt: Date;               // Comment creation time
  parentCommentId?: string | null; // Parent comment ID when this is a nested reply
  pageRules?: PageReplyRules;    // Pre-loaded page rules (avoids DB fetch)
  commentState?: {               // Pre-loaded comment state (avoids DB fetch)
    replied: boolean;
    status: string;
    aiGeneratedReply: string | null;
  };
}

/**
 * Max auto-replies to the SAME author's NESTED replies within ONE thread.
 * Loop protection: the per-user cooldown defaults to 0 (disabled), so without
 * this cap another auto-replying bot account could ping-pong with us
 * indefinitely inside a single thread. The author's answered top-level comment
 * is not counted (it has no parentCommentId), so one author can receive at
 * most 1 + THREAD_REPLY_CAP auto-replies per thread in total.
 */
const THREAD_REPLY_CAP = 3;

export interface ReplyDecisionResult {
  allowed: boolean;              // true = proceed, false = skip
  reason: string;                // Human-readable explanation
  ruleTriggered: string;         // Rule ID for analytics (e.g., "cooldown_active")
  debugInfo?: Record<string, any>; // Additional debug data
}

export interface PageReplyRules {
  // Master settings
  autoReplyEnabled: boolean;
  autoReplyPositive: boolean;
  autoReplyNeutral: boolean;
  
  // Conditions
  replyUserCooldownMinutes: number;
  replyOnlyFirstComment: boolean;
  replyMinCommentLength: number;
  replyBlocklistKeywords: string | null;
  replyAllowlistKeywords: string | null;
  replyAllowlistEnabled: boolean;
}

// ============================================================
// MAIN DECISION FUNCTION
// ============================================================

/**
 * Determines if AI should reply to a comment based on strict rules.
 * 
 * Decision Order (early exit on first failure):
 * 1. Master switch check
 * 2. Sentiment allowed check
 * 3. Already replied check
 * 4. Cooldown check
 * 5. Minimum length check
 * 6. Blocklist check
 * 7. Allowlist check (if enabled)
 * 
 * @returns Decision result with allowed boolean and reason
 */
export async function shouldGenerateReply(
  config: ReplyDecisionConfig
): Promise<ReplyDecisionResult> {
  
  // ============================================================
  // STEP 0: Load page rules (skip DB fetch if caller provided them)
  // ============================================================

  let rules: PageReplyRules;

  if (config.pageRules) {
    rules = config.pageRules;
  } else {
    const page = await prisma.connectedPage.findUnique({
      where: { id: config.pageId },
      select: {
        autoReplyEnabled: true,
        autoReplyPositive: true,
        autoReplyNeutral: true,
        replyUserCooldownMinutes: true,
        replyOnlyFirstComment: true,
        replyMinCommentLength: true,
        replyBlocklistKeywords: true,
        replyAllowlistKeywords: true,
        replyAllowlistEnabled: true,
      },
    });

    if (!page) {
      return {
        allowed: false,
        reason: 'Connected page not found',
        ruleTriggered: 'page_not_found',
      };
    }

    rules = {
      autoReplyEnabled: page.autoReplyEnabled,
      autoReplyPositive: page.autoReplyPositive,
      autoReplyNeutral: page.autoReplyNeutral,
      replyUserCooldownMinutes: page.replyUserCooldownMinutes,
      replyOnlyFirstComment: page.replyOnlyFirstComment,
      replyMinCommentLength: page.replyMinCommentLength,
      replyBlocklistKeywords: page.replyBlocklistKeywords,
      replyAllowlistKeywords: page.replyAllowlistKeywords,
      replyAllowlistEnabled: page.replyAllowlistEnabled,
    };
  }
  
  // ============================================================
  // STEP 1: Master switch check
  // ============================================================
  
  if (!rules.autoReplyEnabled) {
    return {
      allowed: false,
      reason: 'Auto-reply is disabled for this page',
      ruleTriggered: 'auto_reply_disabled',
    };
  }
  
  // ============================================================
  // STEP 2: Sentiment allowed check
  // ============================================================
  
  const sentiment = config.sentiment.toLowerCase();
  
  if (sentiment === 'positive' && !rules.autoReplyPositive) {
    return {
      allowed: false,
      reason: 'Auto-reply to positive comments is disabled',
      ruleTriggered: 'sentiment_not_allowed',
      debugInfo: { sentiment: 'positive', setting: 'autoReplyPositive: false' },
    };
  }
  
  if (sentiment === 'neutral' && !rules.autoReplyNeutral) {
    return {
      allowed: false,
      reason: 'Auto-reply to neutral comments is disabled',
      ruleTriggered: 'sentiment_not_allowed',
      debugInfo: { sentiment: 'neutral', setting: 'autoReplyNeutral: false' },
    };
  }
  
  if (sentiment === 'negative') {
    return {
      allowed: false,
      reason: 'Auto-reply to negative comments is never allowed',
      ruleTriggered: 'sentiment_negative',
      debugInfo: { sentiment: 'negative' },
    };
  }
  
  // ============================================================
  // STEP 3: Already replied check (Idempotency)
  // ============================================================

  let commentState: { replied: boolean; status: string; aiGeneratedReply: string | null };

  if (config.commentState) {
    commentState = config.commentState;
  } else {
    const comment = await prisma.comment.findUnique({
      where: { id: config.commentDbId },
      select: {
        replied: true,
        status: true,
        aiGeneratedReply: true,
      },
    });

    if (!comment) {
      return {
        allowed: false,
        reason: 'Comment not found in database',
        ruleTriggered: 'comment_not_found',
      };
    }

    commentState = comment;
  }

  // Check if already replied
  if (commentState.replied) {
    return {
      allowed: false,
      reason: 'Comment already has a reply',
      ruleTriggered: 'already_replied',
      debugInfo: { replied: true, status: commentState.status },
    };
  }
  
  // Check if AI reply already generated (even if not posted)
  if (commentState.aiGeneratedReply) {
    return {
      allowed: false,
      reason: 'AI reply already generated for this comment',
      ruleTriggered: 'reply_already_generated',
      debugInfo: { aiGeneratedReply: commentState.aiGeneratedReply.substring(0, 50) },
    };
  }
  
  // Check if status indicates processing
  if (commentState.status === 'ai_generated' || commentState.status === 'replied') {
    return {
      allowed: false,
      reason: `Comment status is ${commentState.status}`,
      ruleTriggered: 'invalid_status',
      debugInfo: { status: commentState.status },
    };
  }
  
  // ============================================================
  // STEP 4: Cooldown check (Per user per page)
  // ============================================================
  
  if (rules.replyUserCooldownMinutes > 0 && config.authorId) {
    const cooldownStart = new Date(
      config.createdAt.getTime() - (rules.replyUserCooldownMinutes * 60 * 1000)
    );
    
    // Find recent replies to this author on this page. Count not only posted
    // replies (replied:true) but also in-flight ones — generated/generating or
    // scheduled-but-not-yet-posted — otherwise a burst from one author within a
    // reply delay / manual-review window all pass the cooldown (AI-5).
    const recentReplies = await prisma.comment.findMany({
      where: {
        pageId: config.pageId,
        authorId: config.authorId,
        OR: [
          { replied: true },
          { status: { in: ['ai_generating', 'ai_generated'] } },
          { scheduledPostAt: { not: null } },
        ],
        createdAt: {
          gte: cooldownStart,
          lt: config.createdAt, // Only check comments BEFORE this one
        },
      },
      select: {
        id: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 1,
    });
    
    if (recentReplies.length > 0) {
      const lastReply = recentReplies[0];
      const minutesSinceLastReply = Math.floor(
        (config.createdAt.getTime() - lastReply.createdAt.getTime()) / 1000 / 60
      );
      
      return {
        allowed: false,
        reason: `User is in cooldown period. Last reply was ${minutesSinceLastReply} minutes ago (minimum: ${rules.replyUserCooldownMinutes} minutes)`,
        ruleTriggered: 'cooldown_active',
        debugInfo: {
          authorId: config.authorId,
          lastReplyAt: lastReply.createdAt.toISOString(),
          minutesSinceLastReply,
          cooldownMinutes: rules.replyUserCooldownMinutes,
        },
      };
    }
  }
  
  // ============================================================
  // STEP 4.5: Thread reply cap (nested replies only)
  // ============================================================

  if (config.parentCommentId && config.authorId) {
    // Count posted AND in-flight replies to this author inside this thread
    // (same in-flight semantics as the cooldown check above).
    const priorThreadReplies = await prisma.comment.count({
      where: {
        pageId: config.pageId,
        authorId: config.authorId,
        parentCommentId: config.parentCommentId,
        OR: [
          { replied: true },
          { status: { in: ['ai_generating', 'ai_generated'] } },
          { scheduledPostAt: { not: null } },
        ],
      },
    });

    if (priorThreadReplies >= THREAD_REPLY_CAP) {
      return {
        allowed: false,
        reason: `Already replied ${priorThreadReplies} times to this author in this thread (cap: ${THREAD_REPLY_CAP})`,
        ruleTriggered: 'thread_reply_limit',
        debugInfo: {
          authorId: config.authorId,
          parentCommentId: config.parentCommentId,
          priorThreadReplies,
          cap: THREAD_REPLY_CAP,
        },
      };
    }
  }

  // ============================================================
  // STEP 5: First comment only check
  // ============================================================
  
  if (rules.replyOnlyFirstComment && config.authorId) {
    // Count previous comments from this author on this page
    const previousComments = await prisma.comment.count({
      where: {
        pageId: config.pageId,
        authorId: config.authorId,
        createdAt: {
          lt: config.createdAt, // Only comments BEFORE this one
        },
      },
    });
    
    if (previousComments > 0) {
      return {
        allowed: false,
        reason: 'Only replying to first comment per user (user has commented before)',
        ruleTriggered: 'not_first_comment',
        debugInfo: {
          authorId: config.authorId,
          previousCommentsCount: previousComments,
        },
      };
    }
  }
  
  // ============================================================
  // STEP 6: Minimum length check
  // ============================================================
  
  const messageLength = config.commentMessage.trim().length;
  
  if (messageLength < rules.replyMinCommentLength) {
    return {
      allowed: false,
      reason: `Comment too short (${messageLength} chars, minimum: ${rules.replyMinCommentLength})`,
      ruleTriggered: 'below_min_length',
      debugInfo: {
        messageLength,
        minLength: rules.replyMinCommentLength,
        message: config.commentMessage.substring(0, 50),
      },
    };
  }
  
  // ============================================================
  // STEP 7: Blocklist check
  // ============================================================
  
  if (rules.replyBlocklistKeywords) {
    try {
      const blocklist: string[] = JSON.parse(rules.replyBlocklistKeywords);
      const messageLower = config.commentMessage.toLowerCase();
      
      for (const keyword of blocklist) {
        if (messageLower.includes(keyword.toLowerCase())) {
          return {
            allowed: false,
            reason: `Comment contains blocked keyword: "${keyword}"`,
            ruleTriggered: 'blocklist_matched',
            debugInfo: {
              matchedKeyword: keyword,
              message: config.commentMessage.substring(0, 50),
            },
          };
        }
      }
    } catch (error) {
      // Invalid JSON, log but continue
    }
  }
  
  // ============================================================
  // STEP 8: Allowlist check (if enabled)
  // ============================================================
  
  if (rules.replyAllowlistEnabled && rules.replyAllowlistKeywords) {
    try {
      const allowlist: string[] = JSON.parse(rules.replyAllowlistKeywords);
      const messageLower = config.commentMessage.toLowerCase();
      
      let matched = false;
      let matchedKeyword = '';
      
      for (const keyword of allowlist) {
        if (messageLower.includes(keyword.toLowerCase())) {
          matched = true;
          matchedKeyword = keyword;
          break;
        }
      }
      
      if (!matched) {
        return {
          allowed: false,
          reason: 'Allowlist is enabled but comment does not contain any required keywords',
          ruleTriggered: 'allowlist_not_matched',
          debugInfo: {
            allowlist,
            message: config.commentMessage.substring(0, 50),
          },
        };
      }
      
      // If we got here, allowlist matched - continue to ALLOW
    } catch (error) {
      // Invalid JSON, log but continue
    }
  }
  
  // ============================================================
  // STEP 9: ALL CHECKS PASSED - ALLOW
  // ============================================================
  
  return {
    allowed: true,
    reason: 'All checks passed - reply generation allowed',
    ruleTriggered: 'allowed',
    debugInfo: {
      sentiment: config.sentiment,
      messageLength,
      authorId: config.authorId || 'unknown',
    },
  };
}

// ============================================================
// LOGGING HELPER
// ============================================================

/**
 * Log decision result with a structured format for prod debuggability, so
 * both allowed and skipped decisions (and which rule fired) are visible.
 */
export function logReplyDecision(
  decision: ReplyDecisionResult,
  commentDbId: string,
  authorName: string
) {
  const tag = decision.allowed ? 'ALLOW' : 'SKIP';
  console.info(
    `[ReplyDecision] ${tag} comment=${commentDbId} author=${authorName || 'unknown'} rule=${decision.ruleTriggered} — ${decision.reason}`
  );
}
