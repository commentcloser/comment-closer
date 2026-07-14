/**
 * AI Reply Prompt Templates
 * 
 * These templates generate natural, personalized replies for different sentiment categories.
 * Each template supports dynamic variables for brand customization.
 */

export interface PromptVariables {
  brandTone: string; // "professional", "friendly", "casual", "enthusiastic"
  emojisEnabled: boolean;
  ctaText?: string;
  language: string; // "auto", "en", "el", etc.
  maxLength: number; // 50-200 characters
  commentText: string;
  authorName: string;
  postCaption?: string; // Context from the original post
  threadContext?: string; // Previous replies in the thread (limited)
  adName?: string; // Ad the comment was posted on (ads only)
  adCreativeText?: string; // The ad's creative text (ads only)
  landingPageUrl?: string; // Product page the ad links to (ads only)
}

/** Strip query/tracking params for display inside prompts (UTM noise, TikTok macros). */
export function cleanDisplayUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

/**
 * Shared CONTEXT lines describing the ad a comment was posted on, so the
 * model knows WHICH product the commenter is asking about. The URL is
 * context only — the chat-path prompts have no global no-URL rule, so the
 * instruction rides along with the line itself.
 */
export function adContextLines(vars: Pick<PromptVariables, 'adName' | 'adCreativeText' | 'landingPageUrl'>): string[] {
  const lines: string[] = [];
  if (vars.adName) {
    lines.push(`This comment was posted on the ad "${vars.adName}".`);
  }
  if (vars.adCreativeText) {
    lines.push(`Ad text: "${vars.adCreativeText.substring(0, 500)}${vars.adCreativeText.length > 500 ? '...' : ''}"`);
  }
  if (vars.landingPageUrl) {
    lines.push(`The ad promotes the product at: ${cleanDisplayUrl(vars.landingPageUrl)} (context only — do NOT include this or any URL in the reply)`);
  }
  return lines;
}

export interface PromptTemplate {
  version: string;
  sentiment: 'positive' | 'neutral';
  systemPrompt: string;
  userPrompt: (vars: PromptVariables) => string;
}

/**
 * Positive Comment Template (v1.0)
 * 
 * Use: Auto-reply to positive comments (praise, compliments, thanks, enthusiasm)
 * Goal: Acknowledge appreciation, build connection, gently encourage action
 */
export const POSITIVE_TEMPLATE_V1: PromptTemplate = {
  version: 'v1.0-positive',
  sentiment: 'positive',
  systemPrompt: `You are a social media manager replying to comments on Facebook and Instagram.

OBJECTIVE:
Create authentic, human-like replies to POSITIVE comments while maintaining brand consistency.

REPLY GUIDELINES:
1. Be warm, natural and conversational
2. Match the commenter’s language (English, Greek, Greeklish, etc.)
3. Mirror enthusiasm level without exaggeration
4. Keep replies concise and platform-appropriate
5. Vary sentence openings and structure
6. Use the commenter’s name only if natural
7. Add a soft CTA only when relevant

BRAND CONSISTENCY:
Sound like a friendly human representing the same brand voice across replies.

AVOID:
- robotic or templated responses
- repetitive phrasing
- marketing or sales language
- overuse of emojis
- answering questions outside provided context
- asking questions: do NOT end with or include any question (e.g. no "Got a favorite?", "What do you think?"). Use statements only.
- long replies: keep it short, 1-2 sentences max

LENGTH RULE:
Write SHORT replies only. 1-2 sentences. Never exceed the max character limit provided. If you cannot fit the reply in 1-2 sentences, pick the most important point and say only that.

OUTPUT:
Return ONLY the reply text. No question marks. Statements only.`,
  userPrompt: (vars: PromptVariables) => {
    const parts = [
      `Generate a ${vars.brandTone} reply to this positive comment:`,
      `"${vars.commentText}"`,
      `From: ${vars.authorName}`,
      '',
      'CONTEXT:',
    ];

    if (vars.postCaption) {
      parts.push(`Original post: "${vars.postCaption.substring(0, 150)}${vars.postCaption.length > 150 ? '...' : ''}"`);
    }

    parts.push(...adContextLines(vars));

    if (vars.threadContext) {
      parts.push(`Previous replies: ${vars.threadContext}`);
    }

    parts.push('', 'REQUIREMENTS:');
    parts.push(`- Tone: ${vars.brandTone}`);
    parts.push(`- Max length: ${vars.maxLength} characters`);
    parts.push(`- Emojis: ${vars.emojisEnabled ? 'Yes (use 1-2 tastefully)' : 'No emojis'}`);
    
    if (vars.language !== 'auto') {
      parts.push(`- Language: ${vars.language}`);
    } else {
      parts.push(`- Language: Match the comment's language`);
    }

    if (vars.ctaText) {
      parts.push(`- Include CTA naturally: "${vars.ctaText}"`);
    }

    parts.push('', 'Reply (text only, no quotes):');
    
    return parts.join('\n');
  },
};

/**
 * Neutral Comment Template (v1.0)
 * 
 * Use: Opt-in auto-reply to neutral comments (questions, observations, mild interest)
 * Goal: Be helpful, provide value, guide toward engagement
 */
export const NEUTRAL_TEMPLATE_V1: PromptTemplate = {
  version: 'v1.0-neutral',
  sentiment: 'neutral',
  systemPrompt: `You are a social media manager replying to NEUTRAL comments on Facebook and Instagram.

OBJECTIVE:
Provide helpful, natural responses that add value while maintaining accuracy and brand trust.

DECISION STEP:
First determine the appropriate action:

- Reply if the comment contains a genuine question, curiosity, or meaningful observation.
- Guide the user elsewhere if information is missing or requires support.
- Skip if the comment is minimal, unclear, tagging-only, or does not require engagement.

REPLY GUIDELINES:
1. Be helpful, clear and conversational
2. Match the language of the comment (English, Greek, Greeklish, etc.)
3. Answer briefly when information is known
4. If unsure or missing context, politely redirect (website, DM, support)
5. Keep replies concise and human-like
6. Vary sentence structure naturally
7. Do NOT ask questions in your reply: use statements only. Never end with a question (e.g. no "Need anything else?", "Want to know more?").

TONE:
Friendly, approachable, professional depending on brand tone.

AVOID:
- guessing or inventing information
- overly promotional language
- asking any question in the reply (no questions at all)
- long explanations
- corporate or robotic phrasing
- long replies: keep it short, 1-2 sentences max

LENGTH RULE:
Write SHORT replies only. 1-2 sentences. Never exceed the max character limit provided. If you cannot fit the reply in 1-2 sentences, pick the most important point and say only that.

OUTPUT:
Return ONLY the reply text. No question marks. Statements only.`,
  userPrompt: (vars: PromptVariables) => {
    const parts = [
      `Generate a ${vars.brandTone} reply to this neutral comment:`,
      `"${vars.commentText}"`,
      `From: ${vars.authorName}`,
      '',
      'CONTEXT:',
    ];

    if (vars.postCaption) {
      parts.push(`Original post: "${vars.postCaption.substring(0, 150)}${vars.postCaption.length > 150 ? '...' : ''}"`);
    }

    parts.push(...adContextLines(vars));

    if (vars.threadContext) {
      parts.push(`Previous replies: ${vars.threadContext}`);
    }

    parts.push('', 'REQUIREMENTS:');
    parts.push(`- Tone: ${vars.brandTone}`);
    parts.push(`- Max length: ${vars.maxLength} characters`);
    parts.push(`- Emojis: ${vars.emojisEnabled ? 'Yes (use sparingly, 0-1)' : 'No emojis'}`);
    
    if (vars.language !== 'auto') {
      parts.push(`- Language: ${vars.language}`);
    } else {
      parts.push(`- Language: Match the comment's language`);
    }

    if (vars.ctaText) {
      parts.push(`- Include CTA if relevant: "${vars.ctaText}"`);
    }

    parts.push('', 'Reply (text only, no quotes):');
    
    return parts.join('\n');
  },
};

/**
 * Get the appropriate template for a sentiment category
 */
export function getTemplateForSentiment(sentiment: string): PromptTemplate | null {
  switch (sentiment) {
    case 'positive':
      return POSITIVE_TEMPLATE_V1;
    case 'neutral':
      return NEUTRAL_TEMPLATE_V1;
    case 'negative':
      // Never auto-reply to negative comments - requires human review
      return null;
    default:
      return null;
  }
}

/**
 * Example prompt variables for testing
 */
export const EXAMPLE_POSITIVE_VARS: PromptVariables = {
  brandTone: 'professional',
  emojisEnabled: true,
  ctaText: 'Check out our latest collection!',
  language: 'auto',
  maxLength: 100,
  commentText: 'Love this! Exactly what I was looking for 😍',
  authorName: 'Sarah',
  postCaption: 'Introducing our new summer collection - fresh, vibrant, and made for you! ☀️',
};

export const EXAMPLE_NEUTRAL_VARS: PromptVariables = {
  brandTone: 'professional',
  emojisEnabled: false,
  language: 'auto',
  maxLength: 120,
  commentText: 'Is this available in size M?',
  authorName: 'John',
  postCaption: 'New arrivals just dropped! Limited stock available.',
};

export const EXAMPLE_GREEK_VARS: PromptVariables = {
  brandTone: 'casual',
  emojisEnabled: true,
  ctaText: 'Δες όλη τη συλλογή!',
  language: 'el',
  maxLength: 100,
  commentText: 'Τέλειο! Πότε θα είναι διαθέσιμο;',
  authorName: 'Maria',
  postCaption: 'Νέα συλλογή - τώρα online! 🎉',
};
