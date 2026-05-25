/**
 * Generate a URL-safe slug from an arbitrary string.
 *
 * Rules:
 *   - Lowercase
 *   - Replace spaces and underscores with hyphens
 *   - Strip non-alphanumeric characters (except hyphens)
 *   - Collapse multiple hyphens
 *   - Trim leading/trailing hyphens
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
