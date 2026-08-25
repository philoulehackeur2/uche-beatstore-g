// @vitest-environment jsdom

/**
 * The behaviours a hand-rolled ⋯ menu never had, and which neither the type
 * checker nor a passing build can catch: a menu renders perfectly and is still
 * unusable from the keyboard, and still puts Delete next to Rename.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ActionMenu } from './ActionMenu';
import type { MenuSection } from '@/lib/ui/action-menu';

afterEach(cleanup);

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Options' }));

function renderMenu(sections: MenuSection[]) {
  return render(<ActionMenu sections={sections} label="Options" />);
}

describe('ActionMenu', () => {
  it('renders danger items last even when declared first', () => {
    renderMenu([
      { id: 'd', danger: true, items: [{ id: 'del', label: 'Delete', onSelect: () => {} }] },
      { id: 'e', items: [{ id: 'rename', label: 'Rename', onSelect: () => {} }] },
    ]);
    open();
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(labels).toEqual(['Rename', 'Delete']);
  });

  it('hides the trigger entirely when every item is hidden', () => {
    renderMenu([{ id: 'e', items: [{ id: 'x', label: 'X', hidden: true, onSelect: () => {} }] }]);
    expect(screen.queryByRole('button', { name: 'Options' })).toBeNull();
  });

  // onSelect is awaited before the menu closes, so the close lands a
  // microtask after the click — an item that fires a PATCH keeps the menu up
  // until it settles rather than blinking out mid-request.
  it('invokes an item and closes', async () => {
    const onSelect = vi.fn();
    renderMenu([{ id: 'e', items: [{ id: 'rename', label: 'Rename', onSelect }] }]);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('stays open for an item that returns keep-open', async () => {
    const onSelect = vi.fn(() => 'keep-open' as const);
    renderMenu([{ id: 'e', items: [{ id: 'sync', label: 'Sync', onSelect }] }]);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sync' }));
    await Promise.resolve();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('moves with arrow keys, skipping disabled rows, and invokes on Enter', async () => {
    const first = vi.fn();
    const third = vi.fn();
    renderMenu([{
      id: 'e',
      items: [
        { id: 'a', label: 'A', onSelect: first },
        { id: 'b', label: 'B', disabled: true, onSelect: () => {} },
        { id: 'c', label: 'C', onSelect: third },
      ],
    }]);
    open();
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' }); // -> A
    fireEvent.keyDown(menu, { key: 'ArrowDown' }); // skips B -> C
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(third).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('invokes a single-letter accelerator', () => {
    const onSelect = vi.fn();
    renderMenu([{
      id: 'e',
      items: [{ id: 'rename', label: 'Rename', shortcut: 'R', shortcutKey: 'r', onSelect }],
    }]);
    open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'R' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('ignores an accelerator pressed with a modifier', () => {
    const onSelect = vi.fn();
    renderMenu([{
      id: 'e',
      items: [{ id: 'rename', label: 'Rename', shortcutKey: 'r', onSelect }],
    }]);
    open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'r', metaKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape without invoking anything', () => {
    const onSelect = vi.fn();
    renderMenu([{ id: 'e', items: [{ id: 'a', label: 'A', onSelect }] }]);
    open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not trap focus — the panel is focusable but tabbable rows are not caged', () => {
    renderMenu([{ id: 'e', items: [{ id: 'a', label: 'A', onSelect: () => {} }] }]);
    open();
    // role="menu" with tabIndex -1 receives focus on mount; a trap would also
    // install a keydown handler that cancels Tab, which we deliberately don't.
    expect(document.activeElement).toBe(screen.getByRole('menu'));
  });
});
