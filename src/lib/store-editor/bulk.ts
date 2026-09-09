/**
 * Multi-section selection and the operations that run across one.
 *
 * The selection itself is a plain ordered list of ids, but every question you
 * want to ask it — what does shift-click extend to, which of these sections
 * will actually honour an alignment change — is the kind of logic that reverts
 * silently when it lives inside a component. So it lives here, and the panel
 * only turns events into calls.
 *
 * The rule that shapes all of it: a bulk operation applies to exactly the
 * sections that will honour it, and skips the rest without complaint. Writing
 * a setting the live storefront ignores is the same defect `sectionCapabilities`
 * exists to prevent — doing it eight times at once does not make it better.
 */

import {
  duplicateSection, isPinnedSection, removeSection, setSectionSetting, supportsSetting,
  updateSection,
  type SectionCapability, type SectionSettings, type StoreBreakpoint, type StoreLayout,
} from './layout';

/* ── Selection ─────────────────────────────────────────────────────────── */

/**
 * The section whose settings the inspector edits.
 *
 * The LAST id, not the first: it is the one most recently clicked, so the
 * inspector follows the pointer rather than staying pinned to whatever the
 * selection happened to start from.
 */
export function primarySelection(ids: string[]): string | null {
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

/** Cmd/Ctrl-click: add if absent, remove if present. */
export function toggleSelection(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/**
 * Shift-click: every section between the anchor and the target, inclusive.
 *
 * Anchored on the CURRENT primary rather than on a separately tracked anchor,
 * so a second shift-click re-extends from the same place instead of dragging
 * the range along behind it. Order follows the document, not the click.
 */
export function extendSelection(order: string[], ids: string[], target: string): string[] {
  const anchor = primarySelection(ids);
  const to = order.indexOf(target);
  if (to === -1) return ids;
  const from = anchor === null ? to : order.indexOf(anchor);
  if (from === -1) return [target];

  const [low, high] = from <= to ? [from, to] : [to, from];
  const range = order.slice(low, high + 1);
  // The target ends up last, so it becomes the primary and the inspector
  // follows the click that made the range.
  const ordered = to >= from ? range : [...range].reverse();
  return [...new Set([...ids.filter((id) => !range.includes(id)), ...ordered])];
}

/** Drop ids that are no longer in the layout — after a delete, say. */
export function pruneSelection(layout: StoreLayout, ids: string[]): string[] {
  const present = new Set(layout.sections.map((section) => section.id));
  return ids.filter((id) => present.has(id));
}

/** Selected ids in document order, which is the order every bulk op applies in. */
export function orderedSelection(layout: StoreLayout, ids: string[]): string[] {
  const selected = new Set(ids);
  return layout.sections.filter((section) => selected.has(section.id)).map((section) => section.id);
}

/* ── Bulk operations ───────────────────────────────────────────────────── */

/** The subset whose kind will actually honour `key`. */
export function sectionsSupporting(layout: StoreLayout, ids: string[], key: SectionCapability): string[] {
  const selected = new Set(ids);
  return layout.sections
    .filter((section) => selected.has(section.id) && supportsSetting(section.kind, key))
    .map((section) => section.id);
}

/**
 * Write one setting across the selection.
 *
 * Sections that do not support the key are skipped rather than written and
 * ignored, so a mixed selection of a hero and three text blocks aligns the text
 * blocks and leaves the hero alone — which is the only outcome that matches
 * what the live page will do.
 */
export function applySettingToSections<K extends keyof SectionSettings & SectionCapability>(
  layout: StoreLayout,
  ids: string[],
  breakpoint: StoreBreakpoint,
  key: K,
  value: SectionSettings[K],
): StoreLayout {
  return sectionsSupporting(layout, ids, key).reduce(
    (current, id) => updateSection(current, id, (section) => setSectionSetting(section, breakpoint, key, value)),
    layout,
  );
}

/**
 * Show or hide every selected section at this breakpoint.
 *
 * Visibility is per breakpoint like every other setting — hiding a run of
 * sections on mobile must not hide them on desktop.
 */
export function setSectionsVisible(
  layout: StoreLayout,
  ids: string[],
  breakpoint: StoreBreakpoint,
  visible: boolean,
): StoreLayout {
  return applySettingToSections(layout, ids, breakpoint, 'visible', visible);
}

/** Lock is a document-level flag, not a per-breakpoint setting. */
export function setSectionsLocked(layout: StoreLayout, ids: string[], locked: boolean): StoreLayout {
  const selected = new Set(ids);
  return {
    ...layout,
    sections: layout.sections.map((section) => (
      selected.has(section.id) ? { ...section, locked } : section
    )),
  };
}

/**
 * Delete the selection.
 *
 * `removeSection` already refuses a locked section, so a mixed selection
 * removes what it can and leaves the rest — the alternative, refusing the whole
 * operation because one section was locked, makes the lock feel like a trap.
 */
export function removeSections(layout: StoreLayout, ids: string[]): StoreLayout {
  return ids.reduce((current, id) => removeSection(current, id), layout);
}

/**
 * Duplicate the selection, returning the new ids so the caller can select them.
 *
 * Runs in document order and from the BOTTOM up: each duplicate is inserted
 * directly after its source, so duplicating top-down would keep re-encountering
 * freshly inserted copies and interleave the result.
 */
export function duplicateSections(
  layout: StoreLayout,
  ids: string[],
): { layout: StoreLayout; ids: string[] } {
  const ordered = orderedSelection(layout, ids);
  const created: string[] = [];
  const next = [...ordered].reverse().reduce((current, id) => {
    const result = duplicateSection(current, id);
    if (result.id) created.unshift(result.id);
    return result.layout;
  }, layout);
  return { layout: next, ids: created };
}

/** How many of the selection can be reordered — pinned sections cannot. */
export function movableSelection(layout: StoreLayout, ids: string[]): string[] {
  const selected = new Set(ids);
  return layout.sections
    .filter((section) => selected.has(section.id) && !isPinnedSection(section.kind))
    .map((section) => section.id);
}

/**
 * A one-line description of what a bulk action will touch.
 *
 * The UI needs to say "4 of 6 sections" when a selection is mixed, because a
 * control that silently applies to half of what is highlighted is worse than
 * one that admits it.
 */
export function describeScope(total: number, affected: number): string {
  if (total <= 1) return '';
  if (affected === total) return `${total} sections`;
  if (affected === 0) return `none of ${total} sections`;
  return `${affected} of ${total} sections`;
}
