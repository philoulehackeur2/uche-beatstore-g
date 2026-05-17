'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Music, CheckCircle2 } from 'lucide-react';
import { analyzeAudio } from '@/lib/audio/analyze.client';
import { useUploadManager } from '@/lib/upload/manager';
import type { TrackType } from '@/lib/types';

interface DropZoneProps {
  playlistId?: string;
  onUploadSuccess?: () => void;
  /** Default track type stamped on enqueued files. The user can flip the
   *  inline picker below the dropzone to tag everything as beat / song
   *  / remix instead of the default 'instrumental'. */
  defaultType?: TrackType;
}

const TYPE_PICKER: { value: TrackType; label: string }[] = [
  { value: 'beat',         label: 'Beat' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'song',         label: 'Song' },
  { value: 'remix',        label: 'Remix' },
];

/**
 * Drop one-or-more audio files. Each file is enqueued into the global upload
 * manager — progress, retry, resume, and persistence live in the floating
 * UploadsTray so the user can navigate away while uploads continue.
 */
export function DropZone({ playlistId, onUploadSuccess, defaultType = 'instrumental' }: DropZoneProps) {
  const enqueue = useUploadManager((s) => s.enqueue);
  const [analyzing, setAnalyzing] = useState(0);
  const [recentEnqueued, setRecentEnqueued] = useState(0);
  // Picker state local to this DropZone instance — each page mount
  // gets its own default. The selected value is stamped on every file
  // dropped in *this* session; switching mid-batch only affects future
  // drops, not files already enqueued.
  const [selectedType, setSelectedType] = useState<TrackType>(defaultType);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;

    // Try a quick browser-side Essentia pass per file (best-effort, parallel).
    setAnalyzing(accepted.length);
    const analyses = await Promise.all(
      accepted.map(async (f) => {
        try {
          return await analyzeAudio(f);
        } catch (err) {
          console.warn('Client analysis failed for', f.name, err);
          return null;
        }
      })
    );
    setAnalyzing(0);

    accepted.forEach((file, i) => {
      enqueue(file, {
        type: selectedType,
        projectId: playlistId ?? null,
        analysis: analyses[i],
        onSuccess: () => onUploadSuccess?.(),
      });
    });
    setRecentEnqueued(accepted.length);
    setTimeout(() => setRecentEnqueued(0), 2200);
  }, [enqueue, playlistId, onUploadSuccess, selectedType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/mpeg': ['.mp3'],
      'audio/mp3': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/wave': ['.wav'],
      'audio/x-wav': ['.wav'],
      'audio/flac': ['.flac'],
      'audio/x-flac': ['.flac'],
      'audio/aiff': ['.aiff', '.aif'],
      'audio/x-aiff': ['.aiff', '.aif'],
      'audio/mp4': ['.m4a'],
      'audio/x-m4a': ['.m4a'],
      'audio/ogg': ['.ogg'],
    },
    multiple: true,
    maxSize: 500 * 1024 * 1024,
  });

  return (
    <div className="space-y-3">
      {/* Track-type picker — clicking a pill must not propagate to the
          dropzone root (which would open the file chooser). Stopping
          propagation inside `onClick` is enough since the dropzone uses
          a click listener, not a label-for-input pattern. */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#4a4338] mr-2">Upload as</span>
        {TYPE_PICKER.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedType(opt.value); }}
            className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded border transition-colors ${
              selectedType === opt.value
                ? 'bg-[#2A2418] border-[#8A7A5C]/40 text-[#E8D8B8]'
                : 'bg-[#14110d] border-[#1a160f] text-[#6a5d4a] hover:text-[#E8DCC8] hover:border-[#2d2620]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div
        {...getRootProps()}
        className={`
          relative overflow-hidden group cursor-pointer
          border-2 border-dashed rounded-3xl p-12 transition-all duration-500
          ${isDragActive ? 'border-[#D4BFA0] bg-[#2A2418]/30 scale-[0.99]' : 'border-[#1f1a13] hover:border-[#4a4338] hover:bg-[#16130e]'}
          ${recentEnqueued > 0 ? 'border-green-500/50 bg-green-500/5' : ''}
        `}
      >
        <input {...getInputProps()} />

      <div className="flex flex-col items-center justify-center text-center gap-6">
        <div className={`
          w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-700
          ${recentEnqueued > 0
            ? 'bg-green-500 text-white'
            : 'bg-[#1a160f] text-[#4a4338] group-hover:text-[#D4BFA0] group-hover:bg-[#2A2418]'}
        `}>
          {analyzing > 0 ? (
            <Music size={32} className="animate-bounce text-[#D4BFA0]" />
          ) : recentEnqueued > 0 ? (
            <CheckCircle2 size={32} />
          ) : (
            <Upload size={32} className="group-hover:scale-110 transition-transform" />
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-black uppercase tracking-[0.3em] text-[#E8DCC8]">
            {analyzing > 0 && `Analyzing ${analyzing} file${analyzing === 1 ? '' : 's'}…`}
            {analyzing === 0 && recentEnqueued > 0 && `${recentEnqueued} queued — see tray`}
            {analyzing === 0 && recentEnqueued === 0 && (isDragActive ? 'Drop to Ingest' : 'Deploy Audio Asset')}
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] max-w-xs mx-auto">
            {analyzing === 0 && recentEnqueued === 0
              ? 'MP3, WAV, FLAC, AIFF, M4A, OGG • MAX 500MB • Multiple files OK'
              : analyzing > 0
              ? 'Spectral pre-pass before queue'
              : 'Uploads continue in background — safe to navigate'}
          </p>
        </div>
      </div>

        <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-[#1f1a13] group-hover:border-[#D4BFA0]/30 transition-colors" />
        <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-[#1f1a13] group-hover:border-[#D4BFA0]/30 transition-colors" />
        <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-[#1f1a13] group-hover:border-[#D4BFA0]/30 transition-colors" />
        <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-[#1f1a13] group-hover:border-[#D4BFA0]/30 transition-colors" />
      </div>
    </div>
  );
}
