/**
 * Example Usage Scripts for AI Reply Engine
 * 
 * These examples demonstrate how to use the AI reply generation functions.
 * Run with: npx tsx examples/ai-reply-examples.ts
 */

import { generateAIReply, shouldAutoReply, detectCommentLanguage } from '../lib/aiReplyEngine';
import type { AIReplyConfig } from '../lib/aiReplyEngine';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

console.log('🤖 AI Reply Engine - Example Usage\n');

/**
 * Example 1: Generate reply for a positive comment (default professional tone)
 */
async function example1_PositiveProfessional() {
  console.log('📝 Example 1: Positive Comment (Professional Tone - Default)');
  console.log('─'.repeat(60));
  
  const config: AIReplyConfig = {
    brandTone: 'professional',
    emojisEnabled: true,
    ctaText: 'Check out our latest collection!',
    language: 'auto',
    maxLength: 100,
    commentText: 'Love this! Exactly what I was looking for 😍',
    authorName: 'Sarah',
    sentiment: 'positive',
    postCaption: 'Introducing our new summer collection - fresh, vibrant, and made for you! ☀️',
  };
  
  console.log('Input:');
  console.log(`  Comment: "${config.commentText}"`);
  console.log(`  Author: ${config.authorName}`);
  console.log(`  Tone: ${config.brandTone}`);
  console.log(`  Max Length: ${config.maxLength} chars\n`);
  
  const result = await generateAIReply(config);
  
  if (result.success) {
    console.log('✅ Generated Reply:');
    console.log(`  "${result.reply}"`);
    console.log(`\n  Model: ${result.model}`);
    console.log(`  Prompt Version: ${result.promptVersion}`);
    console.log(`  Length: ${result.reply?.length} chars`);
    console.log(`  Generation Time: ${result.generationTimeMs}ms`);
    console.log(`  Tokens Used: ${result.tokensUsed || 'N/A'}`);
  } else {
    console.log('❌ Failed to generate reply:');
    console.log(`  Error: ${result.error}`);
  }
  
  console.log('\n');
}

/**
 * Example 2: Generate reply for a neutral question (professional tone)
 */
async function example2_NeutralProfessional() {
  console.log('📝 Example 2: Neutral Question (Professional Tone)');
  console.log('─'.repeat(60));
  
  const config: AIReplyConfig = {
    brandTone: 'professional',
    emojisEnabled: false,
    language: 'auto',
    maxLength: 120,
    commentText: 'Is this available in size M?',
    authorName: 'John',
    sentiment: 'neutral',
    postCaption: 'New arrivals just dropped! Limited stock available.',
  };
  
  console.log('Input:');
  console.log(`  Comment: "${config.commentText}"`);
  console.log(`  Author: ${config.authorName}`);
  console.log(`  Tone: ${config.brandTone}`);
  console.log(`  Emojis: ${config.emojisEnabled}\n`);
  
  const result = await generateAIReply(config);
  
  if (result.success) {
    console.log('✅ Generated Reply:');
    console.log(`  "${result.reply}"`);
    console.log(`\n  Model: ${result.model}`);
    console.log(`  Length: ${result.reply?.length} chars`);
    console.log(`  Generation Time: ${result.generationTimeMs}ms`);
  } else {
    console.log('❌ Failed to generate reply:');
    console.log(`  Error: ${result.error}`);
  }
  
  console.log('\n');
}

/**
 * Example 3: Generate reply for Greek comment (casual tone)
 */
async function example3_GreekCasual() {
  console.log('📝 Example 3: Greek Comment (Casual Tone)');
  console.log('─'.repeat(60));
  
  const config: AIReplyConfig = {
    brandTone: 'casual',
    emojisEnabled: true,
    ctaText: 'Δες όλη τη συλλογή!',
    language: 'el',
    maxLength: 100,
    commentText: 'Τέλειο! Πότε θα είναι διαθέσιμο;',
    authorName: 'Maria',
    sentiment: 'positive',
    postCaption: 'Νέα συλλογή - τώρα online! 🎉',
  };
  
  console.log('Input:');
  console.log(`  Comment: "${config.commentText}"`);
  console.log(`  Author: ${config.authorName}`);
  console.log(`  Tone: ${config.brandTone}`);
  console.log(`  Language: ${config.language}\n`);
  
  const result = await generateAIReply(config);
  
  if (result.success) {
    console.log('✅ Generated Reply:');
    console.log(`  "${result.reply}"`);
    console.log(`\n  Model: ${result.model}`);
    console.log(`  Length: ${result.reply?.length} chars`);
    console.log(`  Generation Time: ${result.generationTimeMs}ms`);
  } else {
    console.log('❌ Failed to generate reply:');
    console.log(`  Error: ${result.error}`);
  }
  
  console.log('\n');
}

/**
 * Example 4: Generate enthusiastic reply with CTA
 */
async function example4_EnthusiasticWithCTA() {
  console.log('📝 Example 4: Enthusiastic Reply with CTA');
  console.log('─'.repeat(60));
  
  const config: AIReplyConfig = {
    brandTone: 'enthusiastic',
    emojisEnabled: true,
    ctaText: 'Shop now and get 20% off!',
    language: 'auto',
    maxLength: 120,
    commentText: 'OMG this is amazing!! 🔥🔥',
    authorName: 'Alex',
    sentiment: 'positive',
    postCaption: 'BIG SALE starts NOW! Everything must go! 🎉',
  };
  
  console.log('Input:');
  console.log(`  Comment: "${config.commentText}"`);
  console.log(`  Author: ${config.authorName}`);
  console.log(`  Tone: ${config.brandTone}`);
  console.log(`  CTA: "${config.ctaText}"\n`);
  
  const result = await generateAIReply(config);
  
  if (result.success) {
    console.log('✅ Generated Reply:');
    console.log(`  "${result.reply}"`);
    console.log(`\n  Model: ${result.model}`);
    console.log(`  Length: ${result.reply?.length} chars`);
    console.log(`  Generation Time: ${result.generationTimeMs}ms`);
  } else {
    console.log('❌ Failed to generate reply:');
    console.log(`  Error: ${result.error}`);
  }
  
  console.log('\n');
}

/**
 * Example 5: Test shouldAutoReply decision logic
 */
function example5_AutoReplyDecisions() {
  console.log('📝 Example 5: Auto-Reply Decision Logic');
  console.log('─'.repeat(60));
  
  const pageSettings = {
    autoReplyEnabled: true,
    autoReplyPositive: true,
    autoReplyNeutral: false,
  };
  
  const testCases = [
    { sentiment: 'positive', expected: true },
    { sentiment: 'neutral', expected: false },
    { sentiment: 'negative', expected: false },
    { sentiment: null, expected: false },
  ];
  
  console.log('Page Settings:');
  console.log(`  autoReplyEnabled: ${pageSettings.autoReplyEnabled}`);
  console.log(`  autoReplyPositive: ${pageSettings.autoReplyPositive}`);
  console.log(`  autoReplyNeutral: ${pageSettings.autoReplyNeutral}\n`);
  
  console.log('Test Cases:');
  testCases.forEach(({ sentiment, expected }) => {
    const result = shouldAutoReply(sentiment, pageSettings);
    const status = result === expected ? '✅' : '❌';
    console.log(`  ${status} Sentiment: ${sentiment || 'null'} → ${result ? 'REPLY' : 'SKIP'} (expected: ${expected ? 'REPLY' : 'SKIP'})`);
  });
  
  console.log('\n');
  
  // Test with neutral enabled
  const pageSettings2 = {
    autoReplyEnabled: true,
    autoReplyPositive: true,
    autoReplyNeutral: true, // Now enabled
  };
  
  console.log('Page Settings (Neutral Enabled):');
  console.log(`  autoReplyEnabled: ${pageSettings2.autoReplyEnabled}`);
  console.log(`  autoReplyPositive: ${pageSettings2.autoReplyPositive}`);
  console.log(`  autoReplyNeutral: ${pageSettings2.autoReplyNeutral}\n`);
  
  console.log('Test Cases:');
  testCases.forEach(({ sentiment, expected: _ }) => {
    const result = shouldAutoReply(sentiment, pageSettings2);
    const willReply = sentiment === 'positive' || sentiment === 'neutral';
    const status = result === willReply ? '✅' : '❌';
    console.log(`  ${status} Sentiment: ${sentiment || 'null'} → ${result ? 'REPLY' : 'SKIP'}`);
  });
  
  console.log('\n');
}

/**
 * Example 6: Test language detection
 */
function example6_LanguageDetection() {
  console.log('📝 Example 6: Language Detection');
  console.log('─'.repeat(60));
  
  const testCases = [
    { text: 'This is amazing!', expected: 'en' },
    { text: 'Αυτό είναι υπέροχο!', expected: 'el' },
    { text: 'Kalimera! Poli wraia!', expected: 'el' }, // Greeklish
    { text: 'efharisto poli', expected: 'el' }, // Greeklish
    { text: 'Great product!', expected: 'en' },
  ];
  
  testCases.forEach(({ text, expected }) => {
    const detected = detectCommentLanguage(text);
    const status = detected === expected ? '✅' : '⚠️ ';
    console.log(`  ${status} "${text}" → ${detected} (expected: ${expected})`);
  });
  
  console.log('\n');
}

/**
 * Example 7: Test with long comment (truncation)
 */
async function example7_LongComment() {
  console.log('📝 Example 7: Long Comment with Short Max Length');
  console.log('─'.repeat(60));
  
  const config: AIReplyConfig = {
    brandTone: 'professional',
    emojisEnabled: true,
    language: 'auto',
    maxLength: 60, // Short limit
    commentText: 'I absolutely love this product! The quality is outstanding, the design is beautiful, and the customer service was excellent. Will definitely buy again!',
    authorName: 'Emma',
    sentiment: 'positive',
  };
  
  console.log('Input:');
  console.log(`  Comment: "${config.commentText}"`);
  console.log(`  Max Length: ${config.maxLength} chars (strict limit)\n`);
  
  const result = await generateAIReply(config);
  
  if (result.success) {
    console.log('✅ Generated Reply:');
    console.log(`  "${result.reply}"`);
    console.log(`\n  Length: ${result.reply?.length} chars (should be ≤ 80 with buffer)`);
    console.log(`  Generation Time: ${result.generationTimeMs}ms`);
  } else {
    console.log('❌ Failed to generate reply:');
    console.log(`  Error: ${result.error}`);
  }
  
  console.log('\n');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('═'.repeat(60));
  console.log('🤖 AI Reply Engine - Example Usage');
  console.log('═'.repeat(60));
  console.log('\n');
  
  try {
    // Non-AI examples (synchronous)
    example5_AutoReplyDecisions();
    example6_LanguageDetection();
    
    // AI examples (async)
    await example1_PositiveProfessional();
    await example2_NeutralProfessional();
    await example3_GreekCasual();
    await example4_EnthusiasticWithCTA();
    await example7_LongComment();
    
    console.log('═'.repeat(60));
    console.log('✅ All examples completed!');
    console.log('═'.repeat(60));
  } catch (error: any) {
    console.error('\n❌ Error running examples:', error?.message);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  example1_PositiveProfessional,
  example2_NeutralProfessional,
  example3_GreekCasual,
  example4_EnthusiasticWithCTA,
  example5_AutoReplyDecisions,
  example6_LanguageDetection,
  example7_LongComment,
};
