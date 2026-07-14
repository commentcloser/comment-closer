import { describe, it, expect } from 'vitest';
import { adContextLines, cleanDisplayUrl, POSITIVE_TEMPLATE_V1, NEUTRAL_TEMPLATE_V1, type PromptVariables } from './promptTemplates';

describe('cleanDisplayUrl', () => {
  it('strips query/tracking params', () => {
    expect(cleanDisplayUrl('https://shop.gr/product-x?utm_source=tiktok&ttclid=__CLICKID__')).toBe('https://shop.gr/product-x');
  });
  it('drops a bare trailing slash on root URLs', () => {
    expect(cleanDisplayUrl('https://shop.gr/')).toBe('https://shop.gr');
  });
  it('returns invalid URLs unchanged', () => {
    expect(cleanDisplayUrl('not a url')).toBe('not a url');
  });
});

describe('adContextLines', () => {
  it('returns nothing without ad context', () => {
    expect(adContextLines({})).toEqual([]);
  });
  it('renders name, creative text, and a cleaned URL with a no-URL instruction', () => {
    const lines = adContextLines({
      adName: 'Summer Sale',
      adCreativeText: 'Get the new lifting bra!',
      landingPageUrl: 'https://shop.gr/bra?utm_campaign=x',
    });
    expect(lines[0]).toContain('Summer Sale');
    expect(lines[1]).toContain('lifting bra');
    expect(lines[2]).toContain('https://shop.gr/bra');
    expect(lines[2]).not.toContain('utm_campaign');
    expect(lines[2]).toContain('do NOT include');
  });
});

describe('templates render ad context', () => {
  const vars: PromptVariables = {
    brandTone: 'friendly',
    emojisEnabled: true,
    language: 'auto',
    maxLength: 150,
    commentText: 'Does it come in size M?',
    authorName: 'Maria',
    adName: 'Bralift ad',
    adCreativeText: 'Lifts +2 sizes!',
    landingPageUrl: 'https://bralift.gr/',
  };
  it('positive template includes the ad context', () => {
    const p = POSITIVE_TEMPLATE_V1.userPrompt(vars);
    expect(p).toContain('Bralift ad');
    expect(p).toContain('Lifts +2 sizes!');
    expect(p).toContain('https://bralift.gr');
  });
  it('neutral template includes the ad context', () => {
    const p = NEUTRAL_TEMPLATE_V1.userPrompt(vars);
    expect(p).toContain('Bralift ad');
    expect(p).toContain('Lifts +2 sizes!');
    expect(p).toContain('https://bralift.gr');
  });
});
