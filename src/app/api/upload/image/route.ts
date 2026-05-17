import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { isR2Configured } from '@/lib/local-store';
import { requireUser } from '@/lib/auth/ownership';

export const runtime = 'nodejs';

// Cap upload size at 8 MB. Images this large are almost always unintentional
// (full-resolution camera shots) and pollute the bucket; the UI displays
// covers at most ~500px square.
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/**
 * POST /api/upload/image
 *
 * Used by project / track / playlist cover uploaders. Pre-fix this route:
 *  - had no auth gate (any visitor could fill the bucket)
 *  - had no MIME or size validation (any file accepted as "image")
 *  - piggybacked on uploadAudio() and dumped images into the `tracks/` path
 *
 * The PATCH call that wires `cover_url` onto the parent row still lives on
 * the client. We return a richer error shape so the caller can show a
 * toast and skip the PATCH when the upload itself fails.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth: prevents drive-by writes from anonymous clients. We don't need
    // the user_id on the upload itself — the row PATCH that follows is
    // already owner-gated.
    const auth = await requireUser();
    if (!auth.ok) return auth.res;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Image too large (${Math.round(file.size / 1024 / 1024)} MB, max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported image type "${file.type}". Use JPEG, PNG, WebP, GIF, or AVIF.` },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = MIME_TO_EXT[file.type] ?? 'bin';

    if (!isR2Configured()) {
      // Local dev: write under public/uploads/covers so the URL works
      // without any storage configuration. Persists across refresh — the
      // previous failure mode here was "file was uploaded but URL was
      // wrong" because the host was missing.
      const id = nanoid(10);
      const filename = `cover-${id}.${ext}`;
      const dir = path.join(process.cwd(), 'public', 'uploads', 'covers');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), buffer);
      return NextResponse.json({ success: true, url: `/uploads/covers/${filename}` });
    }

    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    if (!bucketName || !publicUrl) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
    }

    const r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });

    const objectKey = `covers/${nanoid(10)}.${ext}`;
    await r2.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: buffer,
        ContentType: file.type,
        // Long cache — cover URLs are content-addressed by nanoid so an
        // updated cover gets a fresh URL anyway.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const url = `${publicUrl.replace(/\/$/, '')}/${objectKey}`;
    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    console.error('Image Upload Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
