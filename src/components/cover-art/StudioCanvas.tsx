'use client';

/**
 * The editing surface.
 *
 * Interaction model, in one place: press a layer to move it, press a handle to
 * resize, press the stem above the selection to rotate, press empty canvas to
 * marquee-select, double-click text to edit it in place, drop image files
 * anywhere to add them. Shift extends a selection and constrains a resize to
 * the original aspect; Alt resizes about the centre.
 *
 * Pointer tracking uses window listeners rather than per-element handlers so a
 * fast drag that leaves the artboard — or the window — still ends cleanly
 * instead of leaving a layer stuck to the cursor.
 *
 * All arithmetic is delegated to `lib/cover/geometry`, which is unit-tested;
 * this file is only responsible for turning events into calls.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  clampToArtboard,
  collectSnapTargets,
  rectFromPoints,
  rectsIntersect,
  resizeHandles,
  resizeRect,
  rotationFromPointer,
  scaleRectWithin,
  selectionBounds,
  snapRect,
  uniformScaleFactor,
  type Rect,
  type ResizeHandle,
} from '@/lib/cover/geometry';
import { LayerView } from './LayerView';
import { sortArtworkLayers, type ArtworkDocument, type ArtworkLayer } from './cover-art-document';

export type LayerPatch = { id: string; patch: Partial<ArtworkLayer> };

type Interaction =
  | { kind: 'move'; startX: number; startY: number; origins: Map<string, Rect>; moved: boolean }
  | {
    kind: 'resize';
    handle: ResizeHandle;
    startX: number;
    startY: number;
    /** The selection's bounding box when the drag started. */
    origin: Rect;
    /** Non-zero only for a single selection; a group always resizes unrotated. */
    rotation: number;
    /** Every member's rect at drag start, plus its type size if it has one. */
    members: Array<{ id: string; rect: Rect; fontSize?: number }>;
  }
  | { kind: 'rotate'; id: string; center: { x: number; y: number } }
  | { kind: 'marquee'; origin: { x: number; y: number }; additive: boolean }
  | { kind: 'pan'; startX: number; startY: number; scrollLeft: number; scrollTop: number };

const handleCursor: Record<ResizeHandle, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};

const handlePosition: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' }, n: { left: '50%', top: '0%' }, ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' }, se: { left: '100%', top: '100%' }, s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' }, w: { left: '0%', top: '50%' },
};

export function StudioCanvas({
  document: doc,
  zoom,
  selectedIds,
  editingId,
  showGuides,
  reactive,
  onSelect,
  onPatchLayers,
  onEditText,
  onDropFiles,
  onZoom,
  onContextMenu,
}: {
  document: ArtworkDocument;
  zoom: number;
  selectedIds: string[];
  editingId: string | null;
  showGuides: boolean;
  /** 0..1 loudness and bass at the playhead, for the audio-reactive preview. */
  reactive: { level: number; bass: number };
  onSelect: (ids: string[]) => void;
  /** `commit` false during a drag, true once on release, so undo gets one entry. */
  onPatchLayers: (patches: LayerPatch[], commit: boolean) => void;
  onEditText: (id: string | null) => void;
  onDropFiles: (files: File[], at: { x: number; y: number }) => void;
  /** Ctrl/Cmd+wheel zoom. The canvas keeps the point under the cursor fixed. */
  onZoom: (zoom: number) => void;
  /** Right-click. `layerId` is null when the press landed on empty canvas. */
  onContextMenu: (at: { x: number; y: number }, layerId: string | null) => void;
}) {
  const artboardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  /** Document point to hold still across a zoom change, and where to hold it. */
  const zoomAnchor = useRef<{ docX: number; docY: number; clientX: number; clientY: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [dropping, setDropping] = useState(false);

  const sorted = sortArtworkLayers(doc.layers);
  const selectedLayers = doc.layers.filter((layer) => selectedIds.includes(layer.id));
  const bounds = selectionBounds(selectedLayers);

  /** Client coordinates to artboard/document coordinates. */
  const toDoc = useCallback((clientX: number, clientY: number) => {
    const box = artboardRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (clientX - box.left) / zoom, y: (clientY - box.top) / zoom };
  }, [zoom]);

  // Listeners are attached unconditionally, and this effect deliberately has no
  // dependency array so each render refreshes the closures.
  //
  // Guarding attachment on `interaction.current` looked equivalent and was not:
  // the ref is set inside a pointerdown handler, and setting a ref does not
  // schedule a render — so for a gesture that changes no state (resize, rotate)
  // the effect never re-ran and the listeners were never added. Resizing simply
  // did nothing. The handlers below bail out when no gesture is active, which is
  // the check that actually belongs at the top of a listener.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active) return;
      const point = toDoc(event.clientX, event.clientY);

      if (active.kind === 'move') {
        const dx = (event.clientX - active.startX) / zoom;
        const dy = (event.clientY - active.startY) / zoom;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) active.moved = true;

        // Snapping is computed from the primary layer only, then applied as one
        // delta to the whole selection — snapping each layer independently
        // would tear a multi-selection apart as it moved.
        const primaryId = selectedIds[0];
        const primaryOrigin = active.origins.get(primaryId);
        let offsetX = dx;
        let offsetY = dy;

        if (primaryOrigin && !event.altKey) {
          const targets = collectSnapTargets(doc, doc.layers, selectedIds);
          const snapped = snapRect(
            { ...primaryOrigin, x: primaryOrigin.x + dx, y: primaryOrigin.y + dy },
            targets,
            14 / zoom,
          );
          offsetX = snapped.x - primaryOrigin.x;
          offsetY = snapped.y - primaryOrigin.y;
          setGuides(snapped.guides);
        } else {
          setGuides({ vertical: [], horizontal: [] });
        }

        onPatchLayers(
          [...active.origins].map(([id, origin]) => ({
            id,
            patch: clampToArtboard({ ...origin, x: origin.x + offsetX, y: origin.y + offsetY }, doc),
          })),
          false,
        );
        return;
      }

      if (active.kind === 'resize') {
        const next = resizeRect({
          rect: active.origin,
          handle: active.handle,
          dx: (event.clientX - active.startX) / zoom,
          dy: (event.clientY - active.startY) / zoom,
          rotation: active.rotation,
          // A multi-selection keeps its proportions unless told otherwise;
          // squashing a whole composition by accident is far more destructive
          // than squashing one box.
          aspectLocked: event.shiftKey || active.members.length > 1,
          fromCenter: event.altKey,
        });

        // Type scales with a group so a composition shrunk as a whole still
        // reads correctly. A single box resize leaves the size alone, which is
        // the usual distinction between resizing a text frame and scaling it.
        const typeScale = active.members.length > 1
          ? uniformScaleFactor(active.origin, next)
          : 1;

        onPatchLayers(active.members.map((member) => {
          const rect = scaleRectWithin(member.rect, active.origin, next);
          return {
            id: member.id,
            patch: {
              x: Math.round(rect.x), y: Math.round(rect.y),
              width: Math.round(rect.width), height: Math.round(rect.height),
              ...(member.fontSize !== undefined
                ? { fontSize: Math.max(4, Math.round(member.fontSize * typeScale)) }
                : {}),
            } as Partial<ArtworkLayer>,
          };
        }), false);
        return;
      }

      if (active.kind === 'rotate') {
        onPatchLayers([{
          id: active.id,
          patch: { rotation: Math.round(rotationFromPointer(active.center, point, event.shiftKey ? 15 : 0)) },
        }], false);
        return;
      }

      if (active.kind === 'pan') {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        scroller.scrollLeft = active.scrollLeft - (event.clientX - active.startX);
        scroller.scrollTop = active.scrollTop - (event.clientY - active.startY);
        return;
      }

      if (active.kind === 'marquee') {
        setMarquee(rectFromPoints(active.origin, point));
      }
    };

    const onUp = () => {
      const active = interaction.current;
      interaction.current = null;
      setGuides({ vertical: [], horizontal: [] });

      if (active?.kind === 'marquee') {
        const box = marquee;
        setMarquee(null);
        if (box && (box.width > 4 || box.height > 4)) {
          const hits = doc.layers
            .filter((layer) => layer.visible && !layer.locked && rectsIntersect(box, layer))
            .map((layer) => layer.id);
          onSelect(active.additive ? [...new Set([...selectedIds, ...hits])] : hits);
        } else if (!active.additive) {
          onSelect([]);
        }
        return;
      }

      // One history entry per gesture, not one per pointermove. Panning moves
      // the viewport, not the artwork, so it never touches history.
      if (!active || active.kind === 'pan') return;
      if (active.kind !== 'move' || active.moved) onPatchLayers([], true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });

  /**
   * Space-to-pan.
   *
   * Tracked as state rather than read at pointerdown so the cursor can change
   * to a grab hand the moment the key goes down — otherwise there is no way to
   * discover the gesture exists. Ignored while typing so a space in a text
   * layer does not arm panning.
   */
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable));
    };
    const onDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTyping(event.target)) return;
      // Stops the page from scrolling under the canvas on every pan.
      event.preventDefault();
      setSpaceHeld(true);
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    // Releasing space outside the window would otherwise leave panning armed.
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /**
   * Ctrl/Cmd+wheel zoom, anchored on the pointer.
   *
   * Registered natively and non-passive because React's onWheel is passive and
   * cannot call preventDefault — without which the browser runs its own page
   * zoom on the same gesture and the app zooms twice.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const box = artboardRef.current?.getBoundingClientRect();
      if (!box) return;
      zoomAnchor.current = {
        docX: (event.clientX - box.left) / zoom,
        docY: (event.clientY - box.top) / zoom,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      // Exponential so each notch feels the same at any magnification.
      const next = zoom * Math.exp(-event.deltaY * 0.0015);
      onZoom(Math.min(2, Math.max(0.02, next)));
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [onZoom, zoom]);

  /**
   * After a zoom change, scroll so the anchored document point is back under
   * the cursor. Layout effect so it lands in the same frame and the canvas does
   * not visibly jump before correcting itself.
   */
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const scroller = scrollerRef.current;
    const box = artboardRef.current?.getBoundingClientRect();
    if (!anchor || !scroller || !box) return;
    zoomAnchor.current = null;
    scroller.scrollLeft += (box.left + anchor.docX * zoom) - anchor.clientX;
    scroller.scrollTop += (box.top + anchor.docY * zoom) - anchor.clientY;
  }, [zoom]);

  function beginMove(event: ReactPointerEvent, layer: ArtworkLayer) {
    // Space-drag pans even when the press lands on a layer, which is what makes
    // panning usable on a canvas that is mostly covered by artwork.
    if (spaceHeld || event.button === 1) return;
    if (layer.locked || editingId) return;
    event.stopPropagation();

    const ids = selectedIds.includes(layer.id)
      ? selectedIds
      : event.shiftKey ? [...selectedIds, layer.id] : [layer.id];
    if (ids !== selectedIds) onSelect(ids);

    const origins = new Map<string, Rect>();
    doc.layers.forEach((item) => {
      if (!ids.includes(item.id) || item.locked) return;
      origins.set(item.id, { x: item.x, y: item.y, width: item.width, height: item.height });
    });
    interaction.current = { kind: 'move', startX: event.clientX, startY: event.clientY, origins, moved: false };
    setGuides({ vertical: [], horizontal: [] });
  }

  function beginResize(event: ReactPointerEvent, handle: ResizeHandle) {
    const movable = selectedLayers.filter((layer) => !layer.locked);
    const box = selectionBounds(movable);
    if (!box) return;
    event.stopPropagation();
    interaction.current = {
      kind: 'resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: box,
      // Only a lone layer resizes in its own rotated frame; a group box is
      // axis-aligned by definition.
      rotation: movable.length === 1 ? movable[0].rotation : 0,
      members: movable.map((layer) => ({
        id: layer.id,
        rect: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
        fontSize: layer.type === 'text' ? layer.fontSize : undefined,
      })),
    };
  }

  function beginRotate(event: ReactPointerEvent) {
    const layer = selectedLayers[0];
    if (!layer || layer.locked) return;
    event.stopPropagation();
    interaction.current = {
      kind: 'rotate',
      id: layer.id,
      center: { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 },
    };
  }

  /** Space-drag or middle-drag pans; otherwise a press on empty canvas marquees. */
  function beginCanvasPress(event: ReactPointerEvent) {
    const wantsPan = spaceHeld || event.button === 1;
    if (wantsPan) {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      event.preventDefault();
      interaction.current = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: scroller.scrollLeft,
        scrollTop: scroller.scrollTop,
      };
      return;
    }

    if (event.button !== 0) return;
    onEditText(null);
    interaction.current = {
      kind: 'marquee',
      origin: toDoc(event.clientX, event.clientY),
      additive: event.shiftKey,
    };
    if (!event.shiftKey) setMarquee(null);
  }

  const singleSelection = selectedLayers.length === 1 ? selectedLayers[0] : null;

  return (
    <div
      ref={scrollerRef}
      // `place-items: safe center` rather than plain centring: when the artboard
      // is zoomed larger than the viewport, ordinary centring pushes its top and
      // left edges outside the scroll range and they become unreachable.
      style={{ placeItems: 'safe center' }}
      className={cn(
        'relative grid h-full min-h-0 overflow-auto bg-[#090907] p-10',
        spaceHeld && 'cursor-grab',
      )}
      onPointerDown={beginCanvasPress}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY }, null);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropping(false);
        const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
        if (files.length > 0) onDropFiles(files, toDoc(event.clientX, event.clientY));
      }}
    >
      <div
        ref={artboardRef}
        className={cn(
          'relative shrink-0 shadow-[0_24px_80px_rgba(0,0,0,0.45)] transition-shadow',
          dropping ? 'ring-2 ring-white/70' : 'ring-1 ring-white/20',
        )}
        style={{ width: doc.width * zoom, height: doc.height * zoom, background: doc.background }}
      >
        {showGuides ? (
          <>
            <div className="pointer-events-none absolute inset-[8%] border border-dashed border-white/20" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-full border-l border-white/10" />
            <div className="pointer-events-none absolute left-0 top-1/2 w-full border-t border-white/10" />
          </>
        ) : null}

        {/* Layers are clipped to the artboard. Without this a layer dragged
            past the edge kept painting over the app chrome, while the exported
            SVG clipped it at the viewBox — the canvas and the export disagreed
            about what the cover actually contains. The selection frame and
            guides sit OUTSIDE this container so handles stay grabbable when a
            layer hangs over the edge. */}
        <div className="absolute inset-0 overflow-hidden">
        {sorted.map((layer) => {
          if (!layer.visible) return null;
          const selected = selectedIds.includes(layer.id);

          // Audio-reactive PREVIEW ONLY — never written to the document, so it
          // cannot leak into an export. Multipliers stay small on purpose: a
          // layer that jumps around cannot be positioned accurately.
          const reactScale = layer.type === 'image' ? 1 + reactive.level * 0.045 : 1;
          const reactStretch = layer.type === 'waveform' ? 1 + reactive.bass * 0.5 : 1;
          const opacity = layer.type === 'waveform'
            ? Math.min(1, layer.opacity * (0.75 + reactive.level * 0.45))
            : layer.opacity;

          const style: CSSProperties = {
            left: layer.x * zoom,
            top: layer.y * zoom,
            width: layer.width * zoom,
            height: layer.height * zoom,
            opacity,
            transform: `rotate(${layer.rotation}deg) scale(${reactScale}) scaleY(${reactStretch})`,
            transformOrigin: 'center',
            mixBlendMode: layer.blendMode,
            zIndex: layer.zIndex,
            pointerEvents: layer.type === 'texture' || layer.locked ? 'none' : undefined,
          };

          return (
            <div
              key={layer.id}
              role="button"
              tabIndex={-1}
              aria-label={`${layer.name} layer`}
              aria-pressed={selected}
              onPointerDown={(event) => beginMove(event, layer)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (layer.type === 'text') onEditText(layer.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                // Right-clicking outside the current selection moves it, so the
                // menu always acts on what the producer actually pointed at.
                if (!selectedIds.includes(layer.id)) onSelect([layer.id]);
                onContextMenu({ x: event.clientX, y: event.clientY }, layer.id);
              }}
              className={cn(
                'absolute select-none outline-none',
                !selected && !layer.locked && 'hover:ring-1 hover:ring-white/20',
                layer.locked ? 'cursor-default' : 'cursor-move',
              )}
              style={style}
            >
              <LayerView
                layer={layer}
                zoom={zoom}
                palette={doc.palette}
                editing={editingId === layer.id}
                onEditDone={() => onEditText(null)}
                onUpdateText={(text) => onPatchLayers([{ id: layer.id, patch: { text } as Partial<ArtworkLayer> }], true)}
              />
            </div>
          );
        })}
        </div>

        {/* Selection frame sits above every layer so its handles stay grabbable
            even when the selected layer is behind others. */}
        {bounds && !editingId ? (
          <div
            className="pointer-events-none absolute z-[999] border border-white/70"
            style={{
              left: bounds.x * zoom,
              top: bounds.y * zoom,
              width: bounds.width * zoom,
              height: bounds.height * zoom,
              transform: singleSelection ? `rotate(${singleSelection.rotation}deg)` : undefined,
              transformOrigin: 'center',
            }}
          >
            {selectedLayers.some((layer) => !layer.locked) ? (
              <>
                {/* Rotation is single-layer only: rotating a group about a
                    shared centre is a different operation, and offering the
                    same handle for both would silently do the wrong one. */}
                {singleSelection && !singleSelection.locked ? (
                  <>
                    <span
                      role="slider"
                      tabIndex={0}
                      aria-label="Rotate layer"
                      aria-valuenow={Math.round(singleSelection.rotation)}
                      aria-valuemin={-180}
                      aria-valuemax={180}
                      onPointerDown={beginRotate}
                      className="pointer-events-auto absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-8 cursor-grab rounded-full border border-white/70 bg-[#090907] hover:bg-white/80"
                    />
                    <span aria-hidden className="absolute left-1/2 top-0 h-6 -translate-x-1/2 -translate-y-6 border-l border-white/70" />
                  </>
                ) : null}
                {resizeHandles.map((handle) => (
                  <span
                    key={handle}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Resize ${handle}`}
                    onPointerDown={(event) => beginResize(event, handle)}
                    className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-[#090907] bg-white/80"
                    style={{ ...handlePosition[handle], cursor: handleCursor[handle] }}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Snap guides, drawn only while a drag is actually snapping. */}
        {guides.vertical.map((line) => (
          <span key={`v-${line}`} aria-hidden className="pointer-events-none absolute top-0 z-[998] h-full border-l border-[#6DC6A4]" style={{ left: line * zoom }} />
        ))}
        {guides.horizontal.map((line) => (
          <span key={`h-${line}`} aria-hidden className="pointer-events-none absolute left-0 z-[998] w-full border-t border-[#6DC6A4]" style={{ top: line * zoom }} />
        ))}

        {marquee ? (
          <span
            aria-hidden
            className="pointer-events-none absolute z-[997] border border-white/70 bg-white/10"
            style={{
              left: marquee.x * zoom, top: marquee.y * zoom,
              width: marquee.width * zoom, height: marquee.height * zoom,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
