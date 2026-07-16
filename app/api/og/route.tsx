import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Bold v2-branded social share card (1200×630). The copy is picked from this
// allowlist via ?card=<key> — the route is public and unauthenticated, so echoing
// caller-supplied ?title=/?description= text let anyone mint an official-looking
// Comment Closer card on the production domain to lend credibility to a phishing
// link. Pages that need their own card add a key here rather than passing free text.
const CARDS = {
  default: {
    title: 'Stop losing sales in your ad comments.',
    description:
      'AI that automatically hides negative comments and replies to every one on your Facebook, Instagram & TikTok ads.',
  },
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardKey = searchParams.get('card') || 'default';
  // hasOwnProperty, not `in`: `?card=constructor` would otherwise resolve off the prototype
  const { title, description } = Object.prototype.hasOwnProperty.call(CARDS, cardKey)
    ? CARDS[cardKey as keyof typeof CARDS]
    : CARDS.default;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#070714',
          color: '#F2F1FF',
          padding: 80,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              width: 48,
              height: 48,
              borderRadius: 13,
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
            }}
          />
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>Comment Closer</div>
        </div>

        {/* headline + sub */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1.5, maxWidth: 1010 }}>
            {title}
          </div>
          <div style={{ fontSize: 30, color: '#9E9CC7', lineHeight: 1.42, maxWidth: 940, marginTop: 26 }}>
            {description}
          </div>
        </div>

        {/* footer tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, fontWeight: 700 }}>
          <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 12, background: '#2CE8A5' }} />
          <div style={{ display: 'flex', color: '#8F73FF' }}>
            Free during early access · Facebook · Instagram · TikTok
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
