/**
 * Zod-based request validation.
 *
 * Before: every POST/PATCH/PUT route did
 *   const body = await req.json();
 *   const x = typeof body.x === 'string' ? body.x : '';
 *   const n = typeof body.n === 'number' ? body.n : 0;
 *   if (n < 0 || n > 5 || !Number.isInteger(n)) return 400;
 *
 * That's repetitive, easy to get wrong, and TypeScript can't help because
 * each field is hand-narrowed.
 *
 * After:
 *   const Body = z.object({ rating: z.number().int().min(0).max(5) });
 *   const parsed = await readBody(req, Body);
 *   if (!parsed.ok) return parsed.res;
 *   const { rating } = parsed.data;  // fully typed
 *
 * One round-trip from raw JSON to typed-validated data. Caught at runtime,
 * narrow at compile time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, type ZodTypeAny } from 'zod';

type ReadBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; res: NextResponse };

/**
 * Parse + validate a JSON request body against a Zod schema. Returns
 * either { ok: true, data } or { ok: false, res } where `res` is the
 * 400 NextResponse the caller can return directly.
 *
 * Errors are mapped to a flat array of `path: message` strings so the
 * client can render field-level feedback when needed.
 */
export async function readBody<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<ReadBodyResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.') || '<root>',
      message: i.message,
    }));
    return {
      ok: false,
      res: NextResponse.json(
        {
          error: issues[0]?.message ?? 'Validation failed',
          issues,
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data as z.infer<S> };
}

// Re-export so route files have one import surface.
export { z };
