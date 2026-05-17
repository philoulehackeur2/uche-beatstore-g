'use client';

import { useMemo, useState } from 'react';
import { TAG_TAXONOMY } from '@/lib/types/tags';
import { useTags } from '@/hooks/useTags';
import { Plus, Sparkles } from 'lucide-react';
import { suggestTags, type TrackFeatures } from '@/lib/audio/feature-tags';

interface TagPickerProps {
  trackId: string;
  /**
   * Audio analysis features for the track. When present, the picker shows a
   * "Suggested" row above the manual taxonomy with one-click chips derived
   * from BPM/energy/valence/etc. Optional so older callers (no features) keep
   * working untouched.
   */
  features?: TrackFeatures | null;
}

export function TagPicker({ trackId, features }: TagPickerProps) {
  const { tags, toggleTag } = useTags(trackId);
  const [customTag, setCustomTag] = useState('');

  const handleToggle = (tag: string, category: string) => {
    const active = tags.includes(tag);
    toggleTag.mutate({ tag, category, active });
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTag.trim()) return;
    if (tags.includes(customTag.trim())) return;
    toggleTag.mutate({ tag: customTag.trim(), category: 'custom', active: false });
    setCustomTag('');
  };

  // Recompute suggestions only when features or applied tags change.
  // Cheap (synchronous heuristics over a handful of rules) so memo is mostly
  // about reference stability for the rendered chip list.
  const suggestions = useMemo(() => {
    if (!features) return [];
    return suggestTags(features, tags, 6);
  }, [features, tags]);

  return (
    <div className="space-y-6 p-4 bg-[#16130e] border border-[#1f1a13] rounded-2xl w-full max-w-sm shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4a4338]">Tag Workspace</h3>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#E8D8B8] ml-1 flex items-center gap-1.5">
            <Sparkles size={10} className="text-[#D4BFA0]" />
            Suggested
          </label>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={`${s.category}:${s.tag}`}
                onClick={() => handleToggle(s.tag, s.category)}
                title={s.reason}
                className="group px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 border bg-[#0a0907] border-dashed border-[#8A7A5C]/40 text-[#E8D8B8]/80 hover:bg-[#2A2418] hover:border-[#8A7A5C] hover:text-[#E8D8B8]"
              >
                {s.tag}
                <span className="ml-1.5 opacity-50 group-hover:opacity-80">+</span>
              </button>
            ))}
          </div>
          <p className="text-[8px] font-mono uppercase tracking-widest text-[#4a4338] ml-1">
            From audio analysis · click to apply
          </p>
        </div>
      )}

      {Object.entries(TAG_TAXONOMY).map(([category, options]) => (
        <div key={category} className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">{category}</label>
          <div className="flex flex-wrap gap-1.5">
            {options.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleToggle(tag, category)}
                  className={`
                    px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 border
                    ${active 
                      ? 'bg-[#2A2418] text-[#E8D8B8] border-[#8A7A5C] shadow-lg shadow-[#D4BFA0]/5' 
                      : 'bg-transparent text-[#4a4338] border-[#2d2620] hover:border-[#4a4338] hover:text-[#a08a6a]'}
                  `}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <form onSubmit={handleAddCustom} className="pt-4 border-t border-[#1f1a13]">
        <div className="relative group">
          <input
            type="text"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="ADD CUSTOM TAG..."
            className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl py-3 pl-10 pr-4 text-[10px] font-bold uppercase tracking-widest text-[#E8DCC8] placeholder-[#2d2620] focus:outline-none focus:border-[#D4BFA0] transition-all"
          />
          <Plus size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2d2620] group-focus-within:text-[#D4BFA0] transition-colors" />
        </div>
      </form>
    </div>
  );
}
