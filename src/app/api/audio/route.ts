import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Audio proxy. Same-origin → no CORS issues for WaveSurfer decoding.
 * Forwards Range requests to R2 so the browser can seek and stream.
 *
 * Accepts ?src=<full audio url> OR ?key=<r2 object key>.
 * Only allows hosts on our R2 public URL or local /uploads paths.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let src = searchParams.get('src');
  const key = searchParams.get('key');

  if (!src && key) {
    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '');
    if (!base) return new Response('Missing R2 base URL', { status: 500 });
    src = `${base}/${key.replace(/^\//, '')}`;
  }

  if (!src) {
    return new Response('Missing src', { status: 400 });
  }

  // Allowlist: only our R2 public host or HTTPS audio sources we already serve
  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const r2Host = r2Base ? new URL(r2Base).host : null;

  if (target.protocol !== 'https:' || (r2Host && target.host !== r2Host)) {
    // Allow internal /uploads via redirect (already same-origin, shouldn't reach here)
    return new Response('Host not allowed', { status: 403 });
  }

  // Forward Range header so seeking works
  const range = req.headers.get('range');
  const upstreamHeaders: Record<string, string> = {};
  if (range) upstreamHeaders['Range'] = range;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: upstreamHeaders,
      // No-cache so we don't double-cache huge audio files
      cache: 'no-store',
    });
  } catch (err: any) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }

  // Pass through the body + relevant headers, add CORS
  const headers = new Headers();
  const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.get('content-type')) headers.set('content-type', 'audio/mpeg');
  if (!headers.get('accept-ranges')) headers.set('accept-ranges', 'bytes');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  headers.set('access-control-allow-headers', 'Range, Content-Type');
  headers.set('access-control-expose-headers', 'Content-Length, Content-Range, Accept-Ranges');
  // Aggressive caching. Audio URLs from R2 are content-addressed —
  // re-uploads get a new key, never a mutated body — so we can let
  // both the browser and Vercel's edge cache them for a long time.
  //   max-age   = browser cache
  //   s-maxage  = shared/CDN cache (Vercel)
  //   immutable = the browser skips even an If-Modified-Since
  //               revalidation on reload because we promise the
  //               bytes can't change for this URL
  headers.set('cache-control', 'public, max-age=86400, s-maxage=31536000, immutable');

  // Download mode: stamp Content-Disposition so the browser actually
  // saves the file instead of navigating to it. Chrome/Firefox ignore
  // <a download> for cross-origin URLs unless the server says attachment.
  if (searchParams.get('download') === '1') {
    const raw = searchParams.get('filename') || target.pathname.split('/').pop() || 'audio';
    // Sanitize: strip anything that could confuse the header parser; the
    // RFC5987-encoded variant covers Unicode titles.
    const safe = raw.replace(/[\r\n"\\]/g, '_');
    const encoded = encodeURIComponent(raw);
    headers.set(
      'content-disposition',
      `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`,
    );
    // Don't let CDNs cache an attachment response and force the same
    // disposition on later range-streamed requests for the same URL.
    headers.set('cache-control', 'no-store');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function HEAD(req: NextRequest) {
  return GET(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range, Content-Type',
    },
  });
}
