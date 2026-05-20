'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, Loader2, FileAudio } from 'lucide-react';
import { analyzeAudio } from '@/lib/audio/analyze.client';
import { useUploadManager } from '@/lib/upload/manager';
import type { TrackType } from '@/lib/types';

interface DropZoneProps {
  playlistId?: string;
  onUploadSuccess?: () => void;
  defaultType?: TrackType;
}

const TYPE_PICKER: { value: TrackType; label: string }[] = [
  { value: 'beat',         label: 'Beat' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'song',         label: 'Song' },
  { value: 'remix',        label: 'Remix' },
];

// Format badge colours — warm neutrals for the standard formats,
// slightly brighter for the lossless ones so the producer knows at
// a glance which files are high-quality.
const FORMAT_STYLE: Record<string, string> = {
  wav:  'text-[#8ecf9f] bg-[#0a1f0a]/60 border-[#1f3a1f]',
  flac: 'text-[#8ecf9f] bg-[#0a1f0a]/60 border-[#1f3a1f]',
  aiff: 'text-[#8ecf9f] bg-[#0a1f0a]/60 border-[#1f3a1f]',
  aif:  'text-[#8ecf9f] bg-[#0a1f0a]/60 border-[#1f3a1f]',
  mp3:  'text-[#c8a84b] bg-[#1f1a0a]/60 border-[#3a2f1f]',
  m4a:  'text-[#a08a6a] bg-[#1a160f]/60 border-[#2d2620]',
  ogg:  'text-[#a08a6a] bg-[#1a160f]/60 border-[#2d2620]',
};

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

interface FileCard {
  file: File;
  ext: string;
  analyzing: boolean;
  done: boolean;
  bpm?: number | null;
  key?: string | null;
  scale?: string | null;
}

export function DropZone({ playlistId, onUploadSuccess, defaultType = 'instrumental' }: DropZoneProps) {
  const enqueue = useUploadManager((s) => s.enqueue);
  const [selectedType, setSelectedType] = useState<TrackType>(defaultType);
  const [cards, setCards] = useState<FileCard[]>([]);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;

    // Populate cards immediately so the user sees their files right away.
    const initial: FileCard[] = accepted.map((f) => ({
      file: f,
      ext: f.name.split('.').pop()?.toLowerCase() || 'audio',
      analyzing: true,
      done: false,
    }));
    setCards(initial);

    // Run analysis in parallel, update each card as its result lands.
    const analyses = await Promise.all(
      accepted.map(async (f, i) => {
        try {
          const result = await analyzeAudio(f);
          setCards((prev) => prev.map((c, ci) =>
            ci === i
              ? { ...c, analyzing: false, bpm: result?.bpm ?? null, key: result?.key ?? null, scale: result?.scale ?? null }
              : c,
          ));
          return result;
        } catch {
          setCards((prev) => prev.map((c, ci) => ci === i ? { ...c, analyzing: false } : c));
          return null;
        }
      }),
    );

    // Enqueue all files.
    accepted.forEach((file, i) => {
      enqueue(file, {
        type: selectedType,
        projectId: playlistId ?? null,
        analysis: analyses[i],
        onSuccess: () => {
          setCards((prev) => prev.map((c, ci) => ci === i ? { ...c, done: true } : c));
          onUploadSuccess?.();
        },
      });
    });

    // Clear cards after 4 seconds so the zone resets for the next batch.
    setTimeout(() => setCards([]), 4000);
  }, [enqueue, playlistId, onUploadSuccess, selectedType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/mpeg': ['.mp3'], 'audio/mp3': ['.mp3'],
      'audio/wav': ['.wav'], 'audio/wave': ['.wav'], 'audio/x-wav': ['.wav'],
      'audio/flac': ['.flac'], 'audio/x-flac': ['.flac'],
      'audio/aiff': ['.aiff', '.aif'], 'audio/x-aiff': ['.aiff', '.aif'],
      'audio/mp4': ['.m4a'], 'audio/x-m4a': ['.m4a'],
      'audio/ogg': ['.ogg'],
    },
    multiple: true,
    maxSize: 500 * 1024 * 1024,
  });

  const analyzing = cards.some((c) => c.analyzing);
  const allDone = cards.length > 0 && cards.every((c) => c.done);

  return (
    <div className="space-y-3">
      {/* Type picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#4a4338] mr-1">Upload as</span>
        {TYPE_PICKER.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedType(opt.value); }}
            className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all ${
              selectedType === opt.value
                ? 'bg-[#2A2418] border-[#8A7A5C]/50 text-[#E8D8B8]'
                : 'bg-[#14110d] border-[#1a160f] text-[#6a5d4a] hover:text-[#E8DCC8] hover:border-[#2d2620]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          relative overflow-hidden group cursor-pointer
          border-2 border-dashed rounded-2xl transition-all duration-300
          ${isDragActive
            ? 'border-[#D4BFA0] bg-[#2A2418]/25 scale-[0.99] shadow-[0_0_40px_rgba(212,191,160,0.08)]'
            : allDone
              ? 'border-green-500/40 bg-green-500/[0.03]'
              : 'border-[#1f1a13] hover:border-[#3a3328] hover:bg-[#0e0c09]'}
        `}
      >
        <input {...getInputProps()} />

        {cards.length > 0 ? (
          /* Per-file cards — shown once files are dropped. */
          <div className="p-4 space-y-2">
            {cards.map((card, i) => {
              const fmtCls = FORMAT_STYLE[card.ext] ?? FORMAT_STYLE.ogg;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    card.done
                      ? 'bg-green-500/[0.04] border-green-500/20'
                      : 'bg-[#14110d] border-[#1f1a13]'
                  }`}
                >
                  {/* Format icon */}
                  <div className="w-8 h-8 rounded-lg bg-[#0a0907] border border-[#1f1a13] flex items-center justify-center shrink-0">
                    <FileAudio size={14} className="text-[#4a4338]" />
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[#E8DCC8] truncate">{card.file.name.replace(/\.[^.]+$/, '')}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded border ${fmtCls}`}>
                        {card.ext.toUpperCase()}
                      </span>
                      <span className="text-[9px] font-mono text-[#4a4338]">{fmtBytes(card.file.size)}</span>
                      {!card.analyzing && card.bpm && (
                        <span className="text-[9px] font-mono text-[#6a5d4a] tabular-nums">{card.bpm} BPM</span>
                      )}
                      {!card.analyzing && card.key && (
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          card.scale === 'minor'
                            ? 'text-[#9d95e8] bg-[#1a1833]/50 border border-[#534AB7]/25'
                            : 'text-[#c8a47a] bg-[#1f1a10]/50 border border-[#3d3020]/30'
                        }`}>
                          {card.key}{card.scale === 'minor' ? 'm' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* State icon */}
                  <div className="shrink-0">
                    {card.analyzing ? (
                      <Loader2 size={14} className="animate-spin text-[#D4BFA0]" />
                    ) : card.done ? (
                      <CheckCircle2 size={14} className="text-green-400" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[#D4BFA0] animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })}
            {analyzing && (
              <p className="text-[9px] font-mono uppercase tracking-wider text-[#4a4338] text-center pt-1">
                Analyzing audio — BPM and key detected automatically
              </p>
            )}
            {allDone && (
              <p className="text-[9px] font-mono uppercase tracking-wider text-green-400/70 text-center pt-1">
                All queued — uploading in background
              </p>
            )}
          </div>
        ) : (
          /* Default idle/drag state */
          <div className="py-10 px-6 flex flex-col items-center justify-center text-center gap-5">
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500
              ${isDragActive
                ? 'bg-[#2A2418] text-[#D4BFA0] scale-110 shadow-[0_0_24px_rgba(212,191,160,0.15)]'
                : 'bg-[#1a160f] text-[#4a4338] group-hover:bg-[#2A2418] group-hover:text-[#D4BFA0]'}
            `}>
              <Upload size={26} className="transition-transform group-hover:scale-110 duration-300" />
            </div>
            <div>
              <h3 className="text-[13px] font-black uppercase tracking-[0.25em] text-[#E8DCC8] mb-1">
                {isDragActive ? 'Drop to ingest' : 'Deploy audio'}
              </h3>
              <p className="text-[9px] font-mono uppercase tracking-widest text-[#3a3328]">
                WAV · FLAC · AIFF · MP3 · M4A · OGG · up to 500 MB
              </p>
            </div>
            {/* Corner marks */}
            <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-[#1f1a13] group-hover:border-[#D4BFA0]/20 transition-colors" />
            <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-[#1f1a13] group-hover:border-[#D4BFA0]/20 transition-colors" />
            <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-[#1f1a13] group-hover:border-[#D4BFA0]/20 transition-colors" />
            <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-[#1f1a13] group-hover:border-[#D4BFA0]/20 transition-colors" />
          </div>
        )}
      </div>
    </div>
  );
}
