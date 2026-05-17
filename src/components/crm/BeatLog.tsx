import { BeatSend, Contact } from '@/lib/types';
import { Mail, CheckCircle, Clock, XCircle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface BeatLogProps {
  sends: BeatSend[];
  /** Optional contact lookup so each row renders the actual contact name
   *  instead of "Contact ID: <uuid>". Passed in from the parent list page
   *  which already has the contacts loaded. */
  contacts?: Contact[];
}

export function BeatLog({ sends, contacts = [] }: BeatLogProps) {
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  
  const getStatusConfig = (status: BeatSend['status']) => {
    switch (status) {
      case 'sent': return { icon: Mail, color: 'text-[#a08a6a]', bg: 'bg-[#1f1a13]', label: 'Sent' };
      case 'opened': return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Opened' };
      case 'interested': return { icon: ArrowUpRight, color: 'text-[#c8a84b]', bg: 'bg-[#c8a84b]/10', label: 'Interested' };
      case 'negotiating': return { icon: Clock, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Negotiating' };
      case 'placed': return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Placed' };
      case 'pass': return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Pass' };
      default: return { icon: Mail, color: 'text-gray-400', bg: 'bg-gray-800', label: status };
    }
  };

  return (
    <div className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1f1a13] flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[#E8DCC8]">Beat Sends Submissions</h3>
        <span className="text-[10px] text-[#a08a6a] font-mono">{sends.length} records</span>
      </div>

      <div className="divide-y divide-[#1f1a13]">
        {sends.map((send) => {
          const status = getStatusConfig(send.status);
          const Icon = status.icon;
          
          return (
            <div key={send.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#16130e] transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${status.bg}`}>
                  <Icon size={16} className={status.color} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#E8DCC8] tracking-tight">
                    {contactById.get(send.contact_id)?.name ?? `Contact ${send.contact_id.slice(0, 6)}`}
                  </h4>
                  <p className="text-xs text-[#a08a6a] mt-1 line-clamp-1">{send.message || 'No message provided'}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className={`text-[10px] uppercase font-bold tracking-widest ${status.color}`}>
                    {status.label}
                  </div>
                  <div className="text-[10px] font-mono text-[#4a4338] mt-1">
                    {new Date(send.sent_at).toLocaleDateString()}
                  </div>
                </div>

                <Link 
                  href={`/share/${send.share_token}`}
                  className="w-8 h-8 rounded-full border border-[#2d2620] hover:border-[#4a4338] flex items-center justify-center text-[#a08a6a] hover:text-[#E8DCC8] transition-all"
                >
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          )
        })}

        {sends.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-[#a08a6a]">
            <Mail size={32} className="mb-4 opacity-50" />
            <p className="text-sm">No beats have been sent out yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
