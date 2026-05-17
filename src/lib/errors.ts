/**
 * Tiny error-handling utilities.
 *
 * Before: every catch block did
 *   catch (error: any) { ...error.message... }
 * which gets flagged by @typescript-eslint/no-explicit-any (set to
 * `error` in this repo) and also hides real bugs — `error.message` is
 * undefined when the thrown thing isn't an Error.
 *
 * Pattern going forward:
 *   catch (err) { return NextResponse.json({ error: errorMessage(err) }, ...) }
 *
 * Equivalent ergonomics, no `any`, and gracefully handles the surprisingly
 * common case of `throw 'string'` or `throw { code: 'XYZ' }` deeper in
 * the call stack.
 */

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err === null || err === undefined) {
    // JSON.stringify(undefined) returns the value `undefined` (not the
    // string "undefined"), which would break this function's return-type
    // contract. Handle both null/undefined up front.
    return String(err);
  }
  if (typeof err === 'object') {
    // Supabase errors come back as { message, details, hint, code } —
    // the message is the only field we ever surface, so prefer it.
    const e = err as { message?: unknown };
    if (typeof e.message === 'string') return e.message;
  }
  try {
    const s = JSON.stringify(err);
    // JSON.stringify can still return `undefined` for functions / symbols.
    return typeof s === 'string' ? s : String(err);
  } catch {
    return String(err);
  }
}

export function isError(x: unknown): x is Error {
  return x instanceof Error;
}
