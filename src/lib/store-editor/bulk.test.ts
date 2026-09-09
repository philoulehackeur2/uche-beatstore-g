import { describe, expect, it } from 'vitest';
import {
  applySettingToSections, describeScope, duplicateSections, extendSelection, movableSelection,
  orderedSelection, primarySelection, pruneSelection, removeSections, sectionsSupporting,
  setSectionsLocked, setSectionsVisible, toggleSelection,
} from './bulk';
import {
  createSection, defaultStoreLayout, resolveSection,
  type StoreLayout,
} from './layout';

function layoutOf(...kinds: Parameters<typeof createSection>[0][]): StoreLayout {
  return { ...defaultStoreLayout(), sections: kinds.map((kind) => createSection(kind)) };
}

const ids = (layout: StoreLayout) => layout.sections.map((section) => section.id);

describe('primarySelection', () => {
  it('is the most recently added id, so the inspector follows the click', () => {
    expect(primarySelection(['a', 'b', 'c'])).toBe('c');
    expect(primarySelection([])).toBeNull();
  });
});

describe('toggleSelection', () => {
  it('adds an absent id and removes a present one', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('makes a newly added id the primary', () => {
    expect(primarySelection(toggleSelection(['a'], 'b'))).toBe('b');
  });
});

describe('extendSelection', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('selects the inclusive range from the primary downwards', () => {
    expect(extendSelection(order, ['b'], 'd')).toEqual(['b', 'c', 'd']);
  });

  it('works upwards too, leaving the click as the primary', () => {
    const result = extendSelection(order, ['d'], 'b');
    expect(new Set(result)).toEqual(new Set(['b', 'c', 'd']));
    expect(primarySelection(result)).toBe('b');
  });

  it('re-extends from the same anchor rather than dragging the range along', () => {
    const first = extendSelection(order, ['b'], 'd');
    const second = extendSelection(order, first, 'c');
    // Anchor is still the primary of `first`, which is 'd'.
    expect(new Set(second)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('starts a selection when there was none', () => {
    expect(extendSelection(order, [], 'c')).toEqual(['c']);
  });

  it('ignores a target that is not in the layout', () => {
    expect(extendSelection(order, ['a'], 'zz')).toEqual(['a']);
  });

  it('never repeats an id', () => {
    const result = extendSelection(order, ['a', 'b'], 'c');
    expect(new Set(result).size).toBe(result.length);
  });
});

describe('pruneSelection / orderedSelection', () => {
  it('drops ids no longer in the layout', () => {
    const layout = layoutOf('text', 'image');
    expect(pruneSelection(layout, [...ids(layout), 'gone'])).toEqual(ids(layout));
  });

  it('returns the selection in document order, not click order', () => {
    const layout = layoutOf('text', 'image', 'video');
    const [a, b, c] = ids(layout);
    expect(orderedSelection(layout, [c, a, b])).toEqual([a, b, c]);
  });
});

describe('sectionsSupporting', () => {
  it('keeps only the kinds that honour the setting', () => {
    const layout = layoutOf('hero', 'text', 'image');
    const [hero, text, image] = ids(layout);
    // hero supports visible + variant only; text and image lay out fully.
    expect(sectionsSupporting(layout, [hero, text, image], 'align')).toEqual([text, image]);
    expect(sectionsSupporting(layout, [hero, text, image], 'visible')).toEqual([hero, text, image]);
  });
});

describe('applySettingToSections', () => {
  it('writes only where the kind honours the key', () => {
    const layout = layoutOf('hero', 'text');
    const [hero, text] = ids(layout);
    const next = applySettingToSections(layout, [hero, text], 'desktop', 'align', 'center');

    expect(resolveSection(next.sections[1], 'desktop').align).toBe('center');
    // The hero was left exactly as it was, not written and then ignored.
    expect(next.sections[0]).toBe(layout.sections[0]);
  });

  it('writes the base on desktop so the change flows to every breakpoint', () => {
    const layout = layoutOf('text');
    const next = applySettingToSections(layout, ids(layout), 'desktop', 'align', 'right');
    expect(resolveSection(next.sections[0], 'mobile').align).toBe('right');
    expect(next.sections[0].overrides.mobile ?? {}).toEqual({});
  });

  it('writes an override on a narrower breakpoint, leaving desktop alone', () => {
    const layout = layoutOf('text');
    const next = applySettingToSections(layout, ids(layout), 'mobile', 'align', 'center');
    expect(resolveSection(next.sections[0], 'mobile').align).toBe('center');
    expect(resolveSection(next.sections[0], 'desktop').align).not.toBe('center');
  });

  it('is a no-op for an empty selection', () => {
    const layout = layoutOf('text');
    expect(applySettingToSections(layout, [], 'desktop', 'align', 'center')).toBe(layout);
  });
});

describe('setSectionsVisible', () => {
  it('hides the selection at one breakpoint only', () => {
    const layout = layoutOf('text', 'image');
    const next = setSectionsVisible(layout, ids(layout), 'mobile', false);
    next.sections.forEach((section) => {
      expect(resolveSection(section, 'mobile').visible).toBe(false);
      expect(resolveSection(section, 'desktop').visible).toBe(true);
    });
  });
});

describe('setSectionsLocked', () => {
  it('locks every selected section and nothing else', () => {
    const layout = layoutOf('text', 'image');
    const [text] = ids(layout);
    const next = setSectionsLocked(layout, [text], true);
    expect(next.sections[0].locked).toBe(true);
    expect(next.sections[1].locked).toBe(false);
  });
});

describe('removeSections', () => {
  it('removes the whole selection', () => {
    const layout = layoutOf('text', 'image', 'video');
    const [a, , c] = ids(layout);
    const next = removeSections(layout, [a, c]);
    expect(next.sections).toHaveLength(1);
  });

  it('removes what it can and leaves the locked ones, rather than refusing outright', () => {
    const layout = setSectionsLocked(layoutOf('text', 'image'), [], false);
    const [a, b] = ids(layout);
    const locked = setSectionsLocked(layout, [a], true);
    const next = removeSections(locked, [a, b]);
    expect(next.sections.map((section) => section.id)).toEqual([a]);
  });
});

describe('duplicateSections', () => {
  it('places each copy directly after its source, in order', () => {
    const layout = layoutOf('text', 'image', 'video');
    const [a, b] = ids(layout);
    const result = duplicateSections(layout, [a, b]);

    expect(result.ids).toHaveLength(2);
    const kinds = result.layout.sections.map((section) => section.kind);
    expect(kinds).toEqual(['text', 'text', 'image', 'image', 'video']);
  });

  it('returns the new ids in document order so the caller can select them', () => {
    const layout = layoutOf('text', 'image');
    const result = duplicateSections(layout, ids(layout));
    const order = result.layout.sections.map((section) => section.id);
    expect(result.ids).toEqual(order.filter((id) => result.ids.includes(id)));
  });

  it('copies are independent of their source', () => {
    const layout = layoutOf('text');
    const result = duplicateSections(layout, ids(layout));
    const edited = applySettingToSections(result.layout, result.ids, 'desktop', 'align', 'right');
    expect(resolveSection(edited.sections[0], 'desktop').align).not.toBe('right');
  });
});

describe('movableSelection', () => {
  it('excludes the pinned kinds', () => {
    const layout = defaultStoreLayout();
    const all = ids(layout);
    const movable = movableSelection(layout, all);
    const kinds = layout.sections
      .filter((section) => movable.includes(section.id))
      .map((section) => section.kind);
    expect(kinds).not.toContain('catalog');
    expect(kinds).not.toContain('trust');
    expect(movable.length).toBe(all.length - 2);
  });
});

describe('describeScope', () => {
  it('says nothing for a single section', () => {
    expect(describeScope(1, 1)).toBe('');
    expect(describeScope(0, 0)).toBe('');
  });

  it('admits when a control only reaches part of the selection', () => {
    expect(describeScope(6, 6)).toBe('6 sections');
    expect(describeScope(6, 4)).toBe('4 of 6 sections');
    expect(describeScope(6, 0)).toBe('none of 6 sections');
  });
});
