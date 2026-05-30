'use client';

import NextImage from 'next/image';
import { useState } from 'react';

/**
 * Cover-art image with next/image optimization (resize + AVIF/WebP) and a
 * safe fallback.
 *
 * next/image can't handle blob: / data: URLs (offline-cached covers) or
 * arbitrary unconfigured hosts — for those we fall back to a plain <img>.
 * We also fall back if the optimizer errors at runtime, so a covered host
 * that isn't allowlisted never shows a broken image.
 *
 * Drop-in for the storefront `<img className="... object-cover" />` covers:
 * pass the same className; we fill the parent (which must be `relative` and
 * sized) via `fill`.
 */
interface CoverImageProps {
  src: string;
  alt?: string;
  className?: string;
  /** Responsive sizes hint for the optimizer. Defaults to a small card. */
  sizes?: string;
  /** eager for above-the-fold hero covers; lazy (default) for grids. */
  priority?: boolean;
}

function isOptimizable(src: string): boolean {
  return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/');
}

export function CoverImage({ src, alt = '', className, sizes = '(max-width: 640px) 50vw, 200px', priority = false }: CoverImageProps) {
  const [errored, setErrored] = useState(false);

  if (!isOptimizable(src) || errored) {
    // blob:/data: covers, or a runtime optimizer failure → plain img.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading={priority ? 'eager' : 'lazy'} />;
  }

  return (
    <NextImage
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setErrored(true)}
      unoptimized={false}
    />
  );
}
