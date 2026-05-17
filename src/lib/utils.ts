/**
 * Minimal class-name joiner. Drops falsy values; no precedence resolution.
 *
 * We don't ship `clsx + tailwind-merge` because we don't need the latter:
 * our components use Tailwind classes only inside their own files and let
 * caller `className` win via normal CSS cascade (later in the class list).
 * If we ever start composing tailwind utilities with conflicting concerns
 * (e.g. `p-2` overriding `p-4`), revisit.
 */
export function cn(...inputs: Array<string | undefined | null | false | 0>): string {
  return inputs.filter(Boolean).join(' ');
}
