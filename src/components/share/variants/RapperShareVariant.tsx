'use client';

import { useState } from 'react';
import { Play, Pause, Music, Sliders, Disc, Plus, Edit3, Save } from 'lucide-react';

interface CreatorProfile {
  display_name?: string | null;
  instagram_handle?: string | null;
}

interface Track {
  id: string;
  title: string;
  type: string;
  audio_url: string;
  cover_url?: string | null;
  duration_seconds?: number | null;
  bpm?: number | null;
  key?: string | null;
  scale?: string | null;
  lyrics?: string | null;
}

interface Project {
  id: string;
  name: string;
  cover_url?: string | null;
  description?: string | null;
}

interface Props {
  project: Project;
  tracks: Track[];
  creator: CreatorProfile | null;
  onPlay: (track: Track) => void;
  playingId?: string | null;
  isPlaying?: boolean;
}

export function RapperShareVariant({ project, tracks, creator, onPlay, playingId, isPlaying }: Props) {
  const currentTrack = tracks.find((t) => t.id === playingId) || tracks[0];
  const displayName = creator?.display_name || project.name;

  // Local state for interactive lyric session notepad
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [editingNotepad, setEditingNotepad] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0907] text-[#E8DCC8] font-sans flex flex-col relative overflow-hidden">
      {/* Ambient background accent */}
      <div 
        className="absolute w-[800px] h-[800px] rounded-full pointer-events-none opacity-[0.03] blur-[150px]"
        style={{
          background: 'radial-gradient(circle, #7F77DD 0%, transparent 70%)',
          top: '-20%',
          right: '-10%'
        }}
      />

      {/* Main layout */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 md:px-12 pt-16 pb-32 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 z-10">
        
        {/* Left Side: Centered Lyric Sheet */}
        <div className="flex flex-col min-w-0">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a08a6a]">
                Vocalist Workspace
              </p>
              <h2 className="text-2xl font-bold uppercase tracking-wider text-white mt-1">
                Lyrics &amp; Topline Sheet
              </h2>
            </div>
            {currentTrack?.bpm || currentTrack?.key ? (
              <div className="flex items-center gap-3 bg-[#14110d] border border-[#1f1a13] px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase text-[#D4BFA0]">
                {currentTrack.key && <span>Key: {currentTrack.key} {currentTrack.scale || ''}</span>}
                {currentTrack.bpm && <span>BPM: {currentTrack.bpm}</span>}
              </div>
            ) : null}
          </div>

          {/* Centered Scrolling Lyric Display */}
          <div className="flex-1 min-h-[450px] bg-[#14110d]/40 border border-[#1f1a13] rounded-2xl p-8 relative overflow-hidden shadow-xl backdrop-blur-sm flex flex-col">
            <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#14110d] to-transparent pointer-events-none z-10" />
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
              {currentTrack?.lyrics ? (
                <div className="text-[15px] leading-[2.2] text-white/90 whitespace-pre-wrap font-sans font-medium select-text tracking-wide max-w-xl mx-auto py-6">
                  {currentTrack.lyrics}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-[#6a5d4a] max-w-sm mx-auto">
                  <Sliders size={32} className="mb-4 opacity-50" />
                  <p className="text-sm font-bold uppercase tracking-wider text-[#a08a6a] mb-2">No Lyrics Uploaded</p>
                  <p className="text-xs leading-relaxed">The producer hasn't uploaded official lyrics for this track yet. Use the writer's notepad on the right to sketch out your bars in real-time!</p>
                </div>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#14110d] to-transparent pointer-events-none z-10" />
          </div>
        </div>

        {/* Right Side: Writers Session Notepad & Tracks Drawer */}
        <div className="flex flex-col gap-8">
          
          {/* Active Player Card */}
          <div className="bg-gradient-to-b from-[#14110d] to-[#0a0907] border border-[#1f1a13] rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex gap-4 items-center mb-6">
              <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[#1f1a13] bg-[#0a0907] relative group">
                {currentTrack?.cover_url || project.cover_url ? (
                  <img src={currentTrack?.cover_url || project.cover_url || ''} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#3a3328]"><Music size={20} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#a08a6a]">{displayName}</p>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider truncate mt-0.5">{currentTrack?.title}</h3>
                <p className="text-[10px] font-mono text-[#6a5d4a] uppercase tracking-widest mt-1">{currentTrack?.type || 'Track'}</p>
              </div>
            </div>

            <button
              onClick={() => onPlay(currentTrack)}
              className="w-full flex items-center justify-center gap-3 bg-[#D4BFA0] hover:bg-[#8A7A5C] text-black font-bold uppercase tracking-[0.2em] text-[10px] py-3.5 rounded-xl transition-all shadow-lg shadow-[#D4BFA0]/10"
            >
              {isPlaying && playingId === currentTrack.id ? (
                <>
                  <Pause size={14} fill="currentColor" /> Pause Preview
                </>
              ) : (
                <>
                  <Play size={14} className="ml-0.5" fill="currentColor" /> Play Preview
                </>
              )}
            </button>
          </div>

          {/* Interactive Writers Notepad */}
          <div className="bg-[#14110d]/50 border border-[#1f1a13] rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#a08a6a]">
                <Edit3 size={14} />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Session Notepad</span>
              </div>
              <button 
                onClick={() => setEditingNotepad(!editingNotepad)}
                className="text-[9px] font-mono uppercase text-[#D4BFA0] hover:text-[#8A7A5C] transition-colors"
              >
                {editingNotepad ? 'Save Sketch' : 'Edit Text'}
              </button>
            </div>

            {editingNotepad ? (
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Sketch out your lyrics, bars, hooks, or notes here while the track plays..."
                className="w-full flex-1 min-h-[220px] bg-[#0a0907] border border-[#1f1a13] rounded-xl px-4 py-3 text-xs text-[#E8DCC8] placeholder:text-[#4a4338] focus:outline-none focus:border-[#D4BFA0] resize-none font-sans leading-relaxed"
              />
            ) : (
              <div 
                onClick={() => setEditingNotepad(true)}
                className="w-full flex-1 min-h-[220px] bg-[#0a0907]/30 border border-[#1f1a13]/60 rounded-xl px-4 py-3 text-xs text-[#6a5d4a] hover:border-[#1f1a13] cursor-pointer whitespace-pre-wrap leading-relaxed select-text"
              >
                {sessionNotes || "Write notes or lyrics here during your session... (Click to edit)"}
              </div>
            )}
          </div>

          {/* Projects Track List (if multiple tracks) */}
          {tracks.length > 1 && (
            <div className="bg-[#14110d]/30 border border-[#1f1a13] rounded-2xl p-5 shadow-xl">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#6a5d4a] mb-3">Workspace Tracks</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {tracks.map((t, i) => {
                  const active = playingId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onPlay(t)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors text-left text-xs ${
                        active ? 'bg-[#14110d]/80 border border-[#1f1a13]' : 'border border-transparent'
                      }`}
                    >
                      <span className="font-mono text-[#6a5d4a]">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`flex-1 font-medium truncate ${active ? 'text-[#D4BFA0]' : 'text-white/80'}`}>{t.title}</span>
                      <span className="text-[9px] font-mono text-[#4a4338] uppercase tracking-wider">{t.key || 'Key'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
