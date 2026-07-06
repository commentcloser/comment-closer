'use client';

import React, { useState } from 'react';
import { TikTokIcon } from '@/components/icons/TikTokIcon';

interface TikTokAvatarProps {
  src?: string | null;
  alt?: string;
  /** Tailwind size classes for the container (e.g. "w-10 h-10"). */
  sizeClass?: string;
  /** Tailwind size classes for the fallback icon (e.g. "w-5 h-5"). */
  iconSizeClass?: string;
  /** Border radius class (default rounded-full). */
  roundedClass?: string;
  className?: string;
}

/**
 * Renders a TikTok profile picture with automatic fallback to the TikTok
 * logo on a black background. Handles both missing URLs (null/undefined)
 * and broken images (404 / expired) via onError.
 */
export function TikTokAvatar({
  src,
  alt = 'TikTok account',
  sizeClass = 'w-10 h-10',
  iconSizeClass = 'w-5 h-5',
  roundedClass = 'rounded-full',
  className = '',
}: TikTokAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  if (showFallback) {
    return (
      <div className={`${sizeClass} bg-[#0F0F0F] ${roundedClass} flex items-center justify-center flex-shrink-0 ${className}`}>
        <TikTokIcon className={`${iconSizeClass} text-white`} />
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClass} ${roundedClass} ring-1 ring-line overflow-hidden flex-shrink-0 ${className}`}>
      <img
        src={src}
        alt={alt}
        onError={() => setErrored(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
