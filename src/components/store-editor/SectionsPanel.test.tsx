// @vitest-environment jsdom

/**
 * The section stack's selection wiring.
 *
 * The maths behind a multi-selection lives in `lib/store-editor/bulk.ts` and is
 * tested there. What can only be wrong HERE is the wiring: whether a plain
 * click, a Cmd-click and a Shift-click are reported as three different
 * intentions, and whether a right-click reaches the menu instead of the
 * browser's own. That is exactly the kind of detail that survives a refactor
 * looking correct while doing nothing.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultStoreLayout } from '@/lib/store-editor/layout';
import { SectionsPanel } from './SectionsPanel';

function setup(selectedIds: string[] = []) {
  const layout = defaultStoreLayout();
  const onSelect = vi.fn();
  const onContextMenu = vi.fn();
  render(
    <SectionsPanel
      layout={layout}
      selectedIds={selectedIds}
      breakpoint="desktop"
      onSelect={onSelect}
      onContextMenu={onContextMenu}
      onReorder={vi.fn()}
      onMove={vi.fn()}
      onToggle={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onRename={vi.fn()}
      renamingId={null}
      onRenamingChange={vi.fn()}
    />,
  );
  const first = layout.sections[0];
  const row = screen.getByText(first.name).closest('button')!;
  return { layout, first, row, onSelect, onContextMenu };
}

describe('SectionsPanel selection', () => {
  it('reports a plain click as neither modifier', () => {
    const { row, first, onSelect } = setup();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(first.id, { meta: false, range: false });
  });

  it('distinguishes Cmd-click, Ctrl-click and Shift-click', () => {
    const { row, first, onSelect } = setup();

    fireEvent.click(row, { metaKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(first.id, { meta: true, range: false });

    fireEvent.click(row, { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(first.id, { meta: true, range: false });

    fireEvent.click(row, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(first.id, { meta: false, range: true });
  });

  it('opens the menu at the pointer and suppresses the browser default', () => {
    const { row, first, onContextMenu } = setup();
    const event = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 120, clientY: 240,
    });
    fireEvent(row, event);

    expect(onContextMenu).toHaveBeenCalledWith(first.id, { x: 120, y: 240 });
    expect(event.defaultPrevented).toBe(true);
  });

  it('marks every selected row, not just the primary', () => {
    const layout = defaultStoreLayout();
    const ids = [layout.sections[0].id, layout.sections[1].id];
    render(
      <SectionsPanel
        layout={layout}
        selectedIds={ids}
        breakpoint="desktop"
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onReorder={vi.fn()}
        onMove={vi.fn()}
        onToggle={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        renamingId={null}
        onRenamingChange={vi.fn()}
      />,
    );

    const pressed = (index: number) => screen
      .getByText(layout.sections[index].name)
      .closest('button')!
      .getAttribute('aria-pressed');

    expect(pressed(0)).toBe('true');
    expect(pressed(1)).toBe('true');
    expect(pressed(2)).toBe('false');
    // And says so in the header, so the count is not something you have to
    // work out by scanning the list.
    expect(screen.getByText('2 selected')).toBeTruthy();
  });
});
