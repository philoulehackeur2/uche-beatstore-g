'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2, Mail, Clock, ShieldAlert } from 'lucide-react';
import { Contact, Track, BeatSend } from '@/lib/types';
import { toast } from '@/hooks/useToast';

interface NudgeModalProps {
  contact: Contact;
  latestSend: BeatSend;
  onClose: () => void;
  onSuccess: () => void;
}

export function NudgeModal({ contact, latestSend, onClose, onSuccess }: NudgeModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);

  // Fetch track details so we can construct a smart follow-up message listing the tracks sent
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tracks');
        const data = await res.json();
        const allTracks: Track[] = Array.isArray(data) ? data : data.tracks || [];
        // Filter to tracks sent in this campaign
        const matched = allTracks.filter((t) => latestSend.track_ids.includes(t.id));
        setTracks(matched);

        // Pre-compose a smart, polite, premium follow-up text
        const trackTitles = matched.map((t) => `"${t.title.toUpperCase()}"`).join(', ');
        const initialText = `Hi ${contact.name},\n\nHope all is well! I'm just following up on the tracks I shared with you last week${trackTitles ? ` (${trackTitles})` : ''}.\n\nI saw you had a chance to open the link, and wanted to see if any of these caught your ear or if you'd like to hear something in a different style!\n\nLet me know what you think.\n\nBest,`;
        setMessage(initialText);
      } catch (err) {
        console.error('Failed to load tracks for nudge builder:', err);
      } finally {
        setLoadingTracks(false);
      }
    })();
  }, [contact, latestSend]);

  const handleSendNudge = async () => {
    if (!message.trim() || !contact.email) return;
    setSending(true);

    try {
      // 1. Dispatch the polite follow-up email via our Resend email client integration
      const emailRes = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          email: contact.email,
          trackIds: latestSend.track_ids,
          shareToken: latestSend.share_token,
          message: message.trim(),
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        throw new Error(errText || 'Failed to send follow-up email');
      }

      // 2. Bump the pipeline status of the campaign send to "negotiating" or "interested"
      const statusRes = await fetch(`/api/beat_sends/${latestSend.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'negotiating' }),
      });

      if (!statusRes.ok) {
        console.warn('Follow-up email succeeded, but failed to auto-transition CRM status.');
      }

      toast.success('Follow-up email sent and pipeline bumped to negotiating!');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Nudge send failed:', err);
      toast.error('Nudge failed to send', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg border border-[#8A7A5C]/25 bg-[#0c0a08]/95 backdrop-blur-md rounded-lg shadow-2xl overflow-hidden p-6 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f1a13]">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-[#D4BFA0]" />
            <h3 className="text-[12px] font-bold uppercase tracking-wider font-akira text-[#E8DCC8]">
              NUDGE CAMPAIGN FOLLOW-UP
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#5a5142] hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Campaign Info */}
        <div className="p-3.5 rounded bg-[#100e0c] border border-[#1f1a13] space-y-2 text-[11px] font-mono text-[#a08a6a]">
          <div className="flex justify-between">
            <span>Recipient:</span>
            <span className="text-[#E8DCC8] font-bold">{contact.name} ({contact.email || 'no email'})</span>
          </div>
          <div className="flex justify-between">
            <span>Last Send Status:</span>
            <span className="text-amber-400 font-bold uppercase">Opened but no reply</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Original Campaign Tracks:</span>
            <span className="text-[#E8D8B8] truncate max-w-[220px]">
              {loadingTracks ? 'Loading...' : tracks.map((t) => t.title.toUpperCase()).join(', ') || 'None'}
            </span>
          </div>
        </div>

        {/* Message Editor */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#5a5142]">
            Draft Follow-Up Email
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="w-full bg-[#070605] border border-[#1f1a13] rounded p-3 text-[12px] text-white placeholder-[#3a3328] focus:outline-none focus:border-[#D4BFA0] resize-none leading-relaxed"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#1f1a13]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#5a5142] font-mono">
            <Clock size={10} />
            <span>Sends via Resend Client</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#1f1a13] hover:border-[#2d2620] rounded text-[10px] font-bold uppercase tracking-wider text-[#6a5d4a] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendNudge}
              disabled={sending || !contact.email || loadingTracks}
              className="flex items-center gap-2 bg-[#D4BFA0] hover:bg-[#8A7A5C] text-white text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 rounded transition-colors disabled:opacity-40"
            >
              {sending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={11} />
              )}
              <span>Send Nudge</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
