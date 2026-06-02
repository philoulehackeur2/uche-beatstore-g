'use client';
import { useState } from 'react';
import { useContactTags } from '@/hooks/useContactTags';
import { Plus } from 'lucide-react';

/**
 * Tag picker for a contact. CRM tags are free-form (cities, vibes, deal status),
 * so this is a flat custom-entry input plus a few common starter suggestions —
 * not the fixed track taxonomy. onChanged lets the parent refresh its list.
 */
const SUGGESTIONS = ['vip', 'paid-before', 'needs-followup', 'hot-lead', 'collab', 'exclusive-buyer', 'local', 'cold'];

export function ContactTagPicker({ contactId, onChanged }: { contactId: string; onChanged?: () => void }) {
  const { tags, toggleTag } = useContactTags(contactId);
  const [custom, setCustom] = useState('');

  const add = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    toggleTag.mutate({ tag: t, category: 'custom', active: false }, { onSuccess: () => onChanged?.() });
  };
  const remove = (tag: string) => toggleTag.mutate({ tag, category: 'custom', active: true }, { onSuccess: () => onChanged?.() });

  return (
    <div className="space-y-3">
      {/* Current tags */}
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-[11px] text-[#3a3328] italic">No tags yet</span>}
        {tags.map((tag) => (
          <button key={tag} onClick={() => remove(tag)}
            className="group flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#2A2418] border border-[#8A7A5C]/40 text-[#E8D8B8] hover:border-red-400/40 transition-colors">
            {tag}
            <span className="text-[#6a5d4a] group-hover:text-red-400">×</span>
          </button>
        ))}
      </div>

      {/* Add custom */}
      <form onSubmit={(e) => { e.preventDefault(); add(custom); setCustom(''); }} className="relative">
        <Plus size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a3328]" />
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add a tag…"
          className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-lg pl-8 pr-3 py-2 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#D4BFA0]" />
      </form>

      {/* Starter suggestions */}
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
          <button key={s} onClick={() => add(s)}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-[#2d2620] text-[#5a5142] hover:text-[#a08a6a] hover:border-[#2d2620] transition-colors">
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
