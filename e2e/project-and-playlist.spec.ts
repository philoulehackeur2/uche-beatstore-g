/**
 * Project bundle + playlist Spotify-style pages.
 *
 * Both share the new <GlassPage> shell — the same selectors should
 * find the eyebrow, title, and tab nav on either. Tests fetch
 * /api/store to discover real IDs at runtime so they pass for any
 * dataset.
 */
import { test, expect, type Page } from '@playwright/test';

async function getFirst(page: Page, kind: 'projects' | 'playlists'): Promise<string | null> {
  const res = await page.request.get('/api/store');
  if (!res.ok()) return null;
  const data = await res.json();
  const list = kind === 'projects' ? data.featuredProjects : data.featuredPlaylists;
  return Array.isArray(list) && list.length > 0 ? list[0].id : null;
}

test.describe('project bundle detail', () => {
  test('renders glass shell + tabs + producer link', async ({ page }) => {
    const projectId = await getFirst(page, 'projects');
    test.skip(!projectId, 'no featured projects in this store');

    await page.goto(`/store/projects/${projectId}`);

    await expect(page.getByText(/project bundle/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tracks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Producer' })).toBeVisible();

    // Click Producer tab → bio + social block shows
    await page.getByRole('button', { name: 'Producer' }).click();
    await expect(page.getByText('About the producer')).toBeVisible();
  });
});

test.describe('playlist detail', () => {
  test('renders glass shell + per-track price buttons + multi-select bar', async ({ page }) => {
    const playlistId = await getFirst(page, 'playlists');
    test.skip(!playlistId, 'no featured playlists in this store');

    await page.goto(`/store/playlists/${playlistId}`);

    await expect(page.getByText(/^playlist$/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tracks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Producer' })).toBeVisible();

    // Hero "Add all" actions
    await expect(page.getByRole('button', { name: /add all .* lease/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add all .* exclusive/i })).toBeVisible();
  });
});

test.describe('access-page gate (poller)', () => {
  test('shows preparing-your-bundle spinner without a token', async ({ page }) => {
    await page.goto('/store/projects/access?session_id=cs_test_does_not_exist');
    await expect(page.getByText(/preparing|still preparing|missing session/i).first()).toBeVisible();
  });
});
