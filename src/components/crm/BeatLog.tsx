import { BeatSend, Contact } from '@/lib/types';
import { Mail, CheckCircle, Clock, XCircle, ArrowUpRight, Music } from 'lucide-react';
import Link from 'next/link';

interface BeatLogProps {
  sends: BeatSend[];
  /** Optional contact lookup so each row renders the actual contact name
   *  instead of "Contact ID: <uuid>". Passed in from the parent list page
   *  which already has the contacts loaded. */
  contacts?: Contact[];
}

const STATUS_CONFIG: Record<string, { icon: typeof Mail; dot: string; text: string; ring: string; label: string }> = {
  sent:        { icon: Mail,        dot: 'bg-[#6a5d4a]', text: 'text-[#a08a6a]', ring: 'ring-[#2d2620]',    label: 'Sent' },
  opened:      { icon: Clock,       dot: 'bg-[#7aa8e8]', text: 'text-[#7aa8e8]', ring: 'ring-[#3a4a6a]',    label: 'Opened' },
  interested:  { icon: ArrowUpRight,dot: 'bg-[#E8D8B8]', text: 'text-[#E8D8B8]', ring: 'ring-[#8A7A5C]/40', label: 'Interested' },
  negotiating: { icon: Clock,       dot: 'bg-[#e8a86a]', text: 'text-[#e8a86a]', ring: 'ring-[#8A7A5C]/40', label: 'Negotiating' },
  placed:      { icon: CheckCircle, dot: 'bg-[#6DC6A4]', text: 'text-[#6DC6A4]', ring: 'ring-[#1f5a4a]',    label: 'Placed' },
  pass:        { icon: XCircle,     dot: 'bg-[#e88a8a]', text: 'text-[#e88a8a]', ring: 'ring-[#6a2a2a]',    label: 'Pass' },
};

const AVATAR_PALETTES = [
  { bg: 'bg-[#1a1230]', text: 'text-[#9d95e8]', border: 'border-[#534AB7]/30' },
  { bg: 'bg-[#0a1f0f]', text: 'text-[#6DC6A4]', border: 'border-[#1f5a4a]/40' },
  { bg: 'bg-[#1f1a0a]', text: 'text-[#c8a84b]', border: 'border-[#3a2f1f]/60' },
  { bg: 'bg-[#1f0f0a]', text: 'text-[#e87a6a]', border: 'border-[#6a2a1f]/40' },
  { bg: 'bg-[#0a1420]', text: 'text-[#7aa8e8]', border: 'border-[#3a4a6a]/40' },
  { bg: 'bg-[#1a1410]', text: 'text-[#E8D8B8]', border: 'border-[#8A7A5C]/30' },
];

function nameToAvatar(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}

export function BeatLog({ sends, contacts = [] }: BeatLogProps) {
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const sorted = [...sends].sort((a, b) =>
    Date.parse(b.sent_at) - Date.parse(a.sent_at),
  );

  return (
    <div className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1f1a13] flex items-center justify-between">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#6a5d4a] mb-1">CRM · Pipeline</p>
          <h3 className="text-[13px] font-bold text-[#E8DCC8]">Beat Sends</h3>
        </div>
        <span className="text-[10px] font-mono text-[#5a5142] tabular-nums">{sends.length} record{sends.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Column headers */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-[40px_1.8fr_0.9fr_1fr_100px_60px] items-center gap-4 px-5 h-8 border-b border-[#1f1a13] text-[9px] font-mono uppercase tracking-wider text-[#3a3328] bg-[#0a0907]">
          <span />
          <span>Contact</span>
          <span>Tracks</span>
          <span>Message</span>
          <span>Status</span>
          <span className="text-right">Open</span>
        </div>
      )}

      <div className="divide-y divide-[#1a160f]">
        {sorted.map((send) => {
          const cfg = STATUS_CONFIG[send.status] ?? STATUS_CONFIG.sent;
          const contact = contactById.get(send.contact_id);
          const name = contact?.name ?? `Contact ${send.contact_id.slice(0, 6)}`;
          const av = nameToAvatar(name);
          const daysDiff = (Date.now() - Date.parse(send.sent_at)) / 86_400_000;
          const needsNudge = send.status === 'sent' && daysDiff > 5;
          const trackCount = send.track_ids?.length ?? 0;

          return (
            <div
              key={send.id}
              className="grid grid-cols-[40px_1.8fr_0.9fr_1fr_100px_60px] items-center gap-4 px-5 h-14 hover:bg-[#16130e] transition-colors"
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${av.bg} border ${av.border} flex items-center justify-center text-[11px] font-bold ${av.text} shrink-0`}>
                {name[0]?.toUpperCase()}
              </div>

              {/* Name + timestamp */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-[#E8DCC8] truncate">{name}</span>
                  {needsNudge && (
                    <span className="bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[7px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded animate-pulse shrink-0">
                      Nudge
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-mono text-[#5a5142] mt-0.5">{relativeDays(send.sent_at)}</p>
              </div>

              {/* Track count */}
              <div className="flex items-center gap-1.5">
                <Music size={10} className="text-[#4a4338] shrink-0" />
                <span className="text-[11px] font-mono text-[#a08a6a] tabular-nums">
                  {trackCount} track{trackCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Message preview */}
              <p className="text-[10px] text-[#6a5d4a] truncate">
                {send.message || <span className="text-[#3a3328] italic">No message</span>}
              </p>

              {/* Status pill */}
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-inset ${cfg.ring} ${cfg.text} w-fit`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.dot === 'bg-[#6a5d4a]' ? '' : 'animate-pulse'}`} />
                {cfg.label}
              </span>

              {/* Open link */}
              <div className="flex justify-end">
                <Link
                  href={`/share/${send.share_token}`}
                  className="w-7 h-7 rounded-full border border-[#2d2620] hover:border-[#4a4338] flex items-center justify-center text-[#5a5142] hover:text-[#E8DCC8] transition-all"
                  title="Open share link"
                >
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          );
        })}

        {sends.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#14110d] border border-[#1f1a13] flex items-center justify-center">
              <Mail size={18} className="text-[#3a3328]" />
            </div>
            <div className="text-center">
              <p className="text-[12px] text-[#E8DCC8] mb-1">No sends yet</p>
              <p className="text-[10px] text-[#5a5142]">Send a beat to a contact to start tracking your pipeline</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
