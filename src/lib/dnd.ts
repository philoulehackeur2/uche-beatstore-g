/**
 * Cross-page drag-and-drop payload helpers.
 *
 * The HTML5 DataTransfer API is a string bus — every payload is a MIME
 * type → string. We define a single custom type and a typed JSON shape
 * so drag sources (TrackCard, TrackRow) and drop targets (contact rows,
 * playlist rows, project rows) agree on what gets passed.
 *
 * Why a custom type instead of `application/json` or `text/plain`:
 *   - Browsers expose `text/plain` as the user's selected text — we'd
 *     get false drops when they drag highlighted text into a contact row.
 *   - Custom types let us discriminate "this is OUR drag" from arbitrary
 *     OS drags (files, etc) by checking `event.dataTransfer.types`.
 */

export const DND_TRACK_TYPE = 'application/x-antigravity-track';

export interface TrackDragPayload {
  kind: 'track';
  id: string;
  title: string;
  cover_url?: string | null;
}

export function setTrackDragData(e: React.DragEvent, payload: Omit<TrackDragPayload, 'kind'>) {
  // Need to set effectAllowed for the cursor to show the right
  // "copy/move/link" affordance. We're not moving the source, so 'copy'.
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(DND_TRACK_TYPE, JSON.stringify({ kind: 'track', ...payload }));
  // text/plain fallback so dropping into an external text input still
  // produces something sensible (the track title).
  e.dataTransfer.setData('text/plain', payload.title);
}

export function readTrackDragData(e: React.DragEvent): TrackDragPayload | null {
  // Browsers serialize the data lazily — we can't peek during dragover
  // (the spec restricts getData() there for security). Use this on drop.
  try {
    const raw = e.dataTransfer.getData(DND_TRACK_TYPE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'track' && typeof parsed.id === 'string') {
      return parsed as TrackDragPayload;
    }
  } catch {
    // Bad JSON or external drag — silently reject.
  }
  return null;
}

/**
 * Check during dragover whether the active drag carries our track type.
 * Used to decide if the drop target should preventDefault() (which
 * makes it "valid" — the cursor changes) and apply hover styling.
 *
 * We can't read the actual data here (browser security restriction),
 * but the *type* is accessible via `types`.
 */
export function isTrackDrag(e: React.DragEvent): boolean {
  // dataTransfer.types is a DOMStringList in some browsers, an Array in
  // others — `includes` works on both.
  return e.dataTransfer.types.includes(DND_TRACK_TYPE);
}
