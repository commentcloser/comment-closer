interface TikTokAdsIconProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * TikTok Ads icon — TikTok logo on a black tile with a small "ADS" badge.
 * Used as a placeholder when no profile image is available for tiktok_ads accounts.
 */
export function TikTokAdsIcon({ size = 'md', className = '' }: TikTokAdsIconProps) {
  const containerSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
  const badgeClass = size === 'sm' ? 'text-[7px] px-0.5' : size === 'lg' ? 'text-[10px] px-1.5 py-0.5' : 'text-[8px] px-1 py-px';

  return (
    <div className={`relative flex-shrink-0 ${containerSize} ${className}`}>
      <div className="w-full h-full rounded-lg bg-[#0F0F0F] flex items-center justify-center">
        <svg className={`${iconSize} text-white`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z" />
        </svg>
      </div>
      <span className={`absolute -bottom-1 -right-1 bg-accent text-on-accent font-bold rounded leading-none ${badgeClass}`}>
        ADS
      </span>
    </div>
  );
}
