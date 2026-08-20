'use client';

/**
 * Left-hand tool panels: Source, Add, Collage, Export.
 *
 * These are the panels that had no implementation before — "Elements" and
 * "Textures" both rendered the string "This panel is staged for Phase 1", and
 * there was no way to add a layer or bring in your own image at all.
 */

import { useRef, useState } from 'react';
import {
  Circle, Grid2x2, Image as ImageIcon, Layers, Minus, Square, Triangle, Type, Upload, Waves,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { collageLayouts, type CollageLayoutId } from '@/lib/cover/collage';
import { coverArtExportPresets, type CoverArtExportPresetId } from '@/design-system';
import type { CoverAttachOption, CoverAttachTargetKind } from '@/lib/upload/cover-attach-options';
import {
  artworkTextureKinds, coverArtDirections,
  type ArtworkDocument, type ArtworkSource, type ArtworkTextureKind,
  type CoverArtDirectionId, type ShapeArtworkLayer,
} from './cover-art-document';
import { FieldLabel, PanelSection, SegmentedField, StudioButton } from './StudioControls';

/* ── Add ───────────────────────────────────────────────────────────────── */

const shapeButtons: Array<{ shape: ShapeArtworkLayer['shape']; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { shape: 'rect', label: 'Rectangle', icon: Square },
  { shape: 'circle', label: 'Circle', icon: Circle },
  { shape: 'triangle', label: 'Triangle', icon: Triangle },
  { shape: 'rule', label: 'Rule', icon: Minus },
];

export function AddPanel({
  onAddImages, onAddText, onAddShape, onAddTexture, onAddWaveform,
}: {
  onAddImages: (files: File[]) => void;
  onAddText: () => void;
  onAddShape: (shape: ShapeArtworkLayer['shape']) => void;
  onAddTexture: (texture: ArtworkTextureKind) => void;
  onAddWaveform: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <PanelSection title="Your images">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length > 0) onAddImages(files);
            // Reset so picking the same file twice still fires a change event.
            event.target.value = '';
          }}
        />
        <StudioButton variant="accent" onClick={() => fileRef.current?.click()} className="w-full">
          <Upload size={13} /> Upload image
        </StudioButton>
        <p className="text-[11px] leading-relaxed text-white/40">
          Or drag image files straight onto the canvas. Pick several at once to build a collage.
        </p>
      </PanelSection>

      <PanelSection title="Add layer">
        <StudioButton onClick={onAddText} className="w-full justify-start">
          <Type size={13} /> Text
        </StudioButton>
        <div className="grid grid-cols-4 gap-1">
          {shapeButtons.map((item) => (
            <button
              key={item.shape}
              type="button"
              title={item.label}
              aria-label={`Add ${item.label}`}
              onClick={() => onAddShape(item.shape)}
              className="grid h-10 place-items-center border border-white/10 text-white/60 transition-colors hover:border-white/20 hover:text-white/90"
            >
              <item.icon size={14} />
            </button>
          ))}
        </div>
        <StudioButton onClick={onAddWaveform} className="w-full justify-start">
          <Waves size={13} /> Waveform
        </StudioButton>
      </PanelSection>

      <PanelSection title="Textures">
        <div className="grid grid-cols-2 gap-1">
          {artworkTextureKinds.map((texture) => (
            <button
              key={texture}
              type="button"
              onClick={() => onAddTexture(texture)}
              className="h-8 border border-white/10 px-2 text-[11px] capitalize text-white/60 transition-colors hover:border-white/20 hover:text-white/90"
            >
              {texture.replace('-', ' ')}
            </button>
          ))}
        </div>
      </PanelSection>
    </>
  );
}

/* ── Collage ───────────────────────────────────────────────────────────── */

export function CollagePanel({
  imageCount, selectedImageCount, layout, onLayout, onArrange, onArrangeSelected, onAddImages,
}: {
  imageCount: number;
  selectedImageCount: number;
  layout: CollageLayoutId;
  onLayout: (layout: CollageLayoutId) => void;
  onArrange: () => void;
  onArrangeSelected: () => void;
  onAddImages: (files: File[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <PanelSection title="Collage">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) onAddImages(files);
          event.target.value = '';
        }}
      />

      <div className="grid gap-1">
        {collageLayouts.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === layout}
            onClick={() => onLayout(item.id)}
            className={cn(
              'border p-2 text-left transition-colors',
              item.id === layout
                ? 'border-white/40 bg-white/[0.08]'
                : 'border-white/10 hover:border-white/20',
            )}
          >
            <span className="block text-[12px] text-white/90">{item.name}</span>
            <span className="block text-[11px] leading-relaxed text-white/40">{item.hint}</span>
          </button>
        ))}
      </div>

      <StudioButton variant="accent" onClick={() => fileRef.current?.click()} className="w-full">
        <ImageIcon size={13} /> Add images to collage
      </StudioButton>

      <StudioButton onClick={onArrange} disabled={imageCount < 2} className="w-full">
        <Grid2x2 size={13} /> Arrange all {imageCount} images
      </StudioButton>

      <StudioButton onClick={onArrangeSelected} disabled={selectedImageCount < 2} className="w-full">
        <Layers size={13} /> Arrange {selectedImageCount} selected
      </StudioButton>

      {imageCount < 2 ? (
        <p className="text-[11px] leading-relaxed text-white/40">
          Add at least two images and a layout will place them for you.
        </p>
      ) : null}
    </PanelSection>
  );
}

/* ── Source + directions ───────────────────────────────────────────────── */

const sourceKinds: ArtworkSource['kind'][] = ['track', 'project', 'playlist', 'empty'];

export function SourcePanel({
  sourceKind, sourceOptions, sourceState, sourceError, selectedSourceId, directionId,
  onSourceKind, onSourceId, onApplyDirection,
}: {
  sourceKind: ArtworkSource['kind'];
  sourceOptions: CoverAttachOption[];
  sourceState: 'idle' | 'loading' | 'loaded' | 'failed';
  sourceError: string | null;
  selectedSourceId: string;
  directionId: CoverArtDirectionId;
  onSourceKind: (kind: ArtworkSource['kind']) => void;
  onSourceId: (id: string) => void;
  onApplyDirection: (id: CoverArtDirectionId) => void;
}) {
  return (
    <>
      <PanelSection title="What is this cover for?">
        <SegmentedField
          value={sourceKind}
          columns={4}
          options={sourceKinds.map((kind) => ({ value: kind, label: kind === 'empty' ? 'Blank' : kind }))}
          onChange={onSourceKind}
        />
        {sourceState === 'loading' ? <p className="text-[12px] text-white/40">Loading…</p> : null}
        {sourceError ? (
          <p className="border border-[#A95235]/40 bg-[#A95235]/10 p-2 text-[12px] text-white/90">{sourceError}</p>
        ) : null}
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {sourceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === selectedSourceId}
              onClick={() => onSourceId(option.id)}
              className={cn(
                'grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 border p-1.5 text-left transition-colors',
                option.id === selectedSourceId
                  ? 'border-white/40 bg-white/[0.08]'
                  : 'border-white/10 hover:border-white/20',
              )}
            >
              <span
                className="block h-8 w-8 bg-cover bg-center"
                style={option.coverUrl ? { backgroundImage: `url(${option.coverUrl})` } : { background: '#0D0D0A' }}
              />
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-white/90">{option.label}</span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                  {option.detail ?? ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Start from a direction">
        <p className="text-[11px] leading-relaxed text-white/40">
          Replaces every layer with a fresh template. Your current work is undoable, but this is a reset.
        </p>
        {coverArtDirections.map((direction) => (
          <button
            key={direction.id}
            type="button"
            aria-pressed={direction.id === directionId}
            onClick={() => onApplyDirection(direction.id)}
            className={cn(
              'w-full border p-2 text-left transition-colors',
              direction.id === directionId
                ? 'border-white/40 bg-white/[0.08]'
                : 'border-white/10 hover:border-white/20',
            )}
          >
            <span className="mb-2 grid h-10 grid-cols-4 gap-0.5">
              {Object.values(direction.palette).slice(0, 4).map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </span>
            <span className="block text-[12px] text-white/90">{direction.name}</span>
            <span className="block text-[11px] leading-relaxed text-white/40">{direction.rationale}</span>
          </button>
        ))}
      </PanelSection>
    </>
  );
}

/* ── Export + attach ───────────────────────────────────────────────────── */

const attachTargetKinds: CoverAttachTargetKind[] = ['track', 'project', 'playlist', 'profile'];

export function ExportPanel({
  document: doc, exportPresetId, exportState, uploadState, attachState, attachError,
  uploadedUrl, attachTargetKind, attachTargetId, attachOptions,
  onExportPreset, onDownloadSvg, onDownloadRaster, onUpload,
  onAttachTargetKind, onAttachTargetId, onAttach,
}: {
  document: ArtworkDocument;
  exportPresetId: CoverArtExportPresetId;
  exportState: 'idle' | 'exporting' | 'failed';
  uploadState: 'idle' | 'uploading' | 'uploaded' | 'failed';
  attachState: 'idle' | 'attaching' | 'attached' | 'failed';
  attachError: string | null;
  uploadedUrl: string | null;
  attachTargetKind: CoverAttachTargetKind;
  attachTargetId: string;
  attachOptions: CoverAttachOption[];
  onExportPreset: (id: CoverArtExportPresetId) => void;
  onDownloadSvg: () => void;
  onDownloadRaster: () => void;
  onUpload: () => void;
  onAttachTargetKind: (kind: CoverAttachTargetKind) => void;
  onAttachTargetId: (id: string) => void;
  onAttach: () => void;
}) {
  // `coverArtExportPresets` is keyed by id, not an array.
  const presets = Object.values(coverArtExportPresets);
  const preset = presets.find((item) => item.id === exportPresetId);

  return (
    <>
      <PanelSection title="Export">
        <label className="grid gap-1.5">
          <FieldLabel>Preset</FieldLabel>
          <select
            value={exportPresetId}
            onChange={(event) => onExportPreset(event.target.value as CoverArtExportPresetId)}
            className="h-9 w-full border border-white/10 bg-[#090907] px-2 text-[12px] text-white/90 outline-none focus:border-white/40"
          >
            {presets.map((item) => (
              <option key={item.id} value={item.id}>{item.name} — {item.width}×{item.height}</option>
            ))}
          </select>
        </label>
        {preset ? (
          <p className="text-[11px] leading-relaxed text-white/40">{preset.intendedUse}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-1">
          <StudioButton onClick={onDownloadRaster} variant="accent" disabled={exportState === 'exporting'}>
            {exportState === 'exporting' ? 'Rendering…' : exportState === 'failed' ? 'Failed' : 'Download'}
          </StudioButton>
          <StudioButton onClick={onDownloadSvg}>SVG</StudioButton>
        </div>
      </PanelSection>

      <PanelSection title="Use as cover">
        <StudioButton onClick={onUpload} disabled={uploadState === 'uploading'} className="w-full">
          {uploadState === 'uploading' ? 'Uploading…'
            : uploadState === 'uploaded' ? 'Uploaded'
              : uploadState === 'failed' ? 'Upload failed — retry' : 'Upload this artwork'}
        </StudioButton>

        <SegmentedField
          label="Attach to"
          value={attachTargetKind}
          columns={4}
          options={attachTargetKinds.map((kind) => ({ value: kind, label: kind }))}
          onChange={onAttachTargetKind}
        />

        {attachTargetKind !== 'profile' && attachOptions.length > 0 ? (
          <select
            value={attachTargetId}
            aria-label={`Choose ${attachTargetKind}`}
            onChange={(event) => onAttachTargetId(event.target.value)}
            className="h-9 w-full border border-white/10 bg-[#090907] px-2 text-[12px] text-white/90 outline-none focus:border-white/40"
          >
            {attachOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        ) : null}

        <StudioButton
          variant="accent"
          onClick={onAttach}
          disabled={!uploadedUrl || attachState === 'attaching'}
          className="w-full"
        >
          {attachState === 'attaching' ? 'Attaching…' : attachState === 'attached' ? 'Attached' : 'Set as cover'}
        </StudioButton>

        {!uploadedUrl ? (
          <p className="text-[11px] leading-relaxed text-white/40">Upload the artwork first, then attach it.</p>
        ) : null}
        {attachError ? <p className="text-[11px] leading-relaxed text-white/90">{attachError}</p> : null}
      </PanelSection>

      <PanelSection title="Document">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
          {doc.width}×{doc.height} · {doc.layers.length} layers
        </p>
      </PanelSection>
    </>
  );
}
