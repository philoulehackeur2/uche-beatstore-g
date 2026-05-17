'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UserPlus, Settings as SettingsIcon, Loader2, LogOut, CheckCircle2, Shield } from 'lucide-react';

interface TeamMember {
  user_id: string;
  role: 'owner' | 'admin' | 'collaborator';
  email: string;
  name: string;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'collaborator'>('collaborator');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Team fetch — use API route if available, else skip
    setLoading(false);
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        setSuccess(true);
        setInviteEmail('');
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-[900px] mx-auto px-10 pt-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 pb-6 border-b border-[#16130e]">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#5a5142] mb-2">Workspace</p>
            <h1 className="text-[28px] font-medium tracking-tight text-white leading-none">Settings</h1>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#1a160f] text-[11px] font-medium text-[#a08a6a] hover:text-red-400 hover:border-red-400/30 transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>

        <div className="space-y-8 mb-32">
          {/* Team */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Shield size={14} className="text-[#5a5142]" />
              <h2 className="text-[12px] font-medium text-[#E8DCC8]">Team members</h2>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 size={16} className="animate-spin text-[#4a4338]" /></div>
            ) : team.length === 0 ? (
              <div className="bg-[#14110d] border border-[#1a160f] rounded-lg p-6 text-center">
                <p className="text-[11px] text-[#5a5142]">No team members yet. Invite collaborators below.</p>
              </div>
            ) : (
              <div className="border border-[#1a160f] rounded-lg divide-y divide-[#161310]">
                {team.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#16130e] border border-[#1a160f] flex items-center justify-center text-[10px] font-medium text-[#a08a6a]">
                        {m.name?.[0] || m.email[0]}
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-[#E8DCC8]">{m.name || m.email}</p>
                        {m.name && <p className="text-[10px] font-mono text-[#5a5142]">{m.email}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${m.role === 'owner' ? 'text-[#E8D8B8]' : 'text-[#5a5142]'}`}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Invite */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={14} className="text-[#5a5142]" />
              <h2 className="text-[12px] font-medium text-[#E8DCC8]">Invite collaborator</h2>
            </div>
            <form onSubmit={handleInvite} className="bg-[#14110d] border border-[#1a160f] rounded-lg p-5 space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1.5 block">Email</label>
                <input
                  required
                  type="email"
                  placeholder="name@email.com"
                  className="w-full bg-[#0a0907] border border-[#1a160f] rounded-md py-2.5 px-3 text-[12px] text-white placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1.5 block">Role</label>
                <select
                  className="w-full bg-[#0a0907] border border-[#1a160f] rounded-md py-2.5 px-3 text-[12px] text-white focus:outline-none focus:border-[#2d2620] transition-colors appearance-none cursor-pointer"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                >
                  <option value="collaborator">Collaborator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                disabled={sending || success}
                type="submit"
                className={`w-full py-2.5 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-2 ${
                  success
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-white text-black hover:bg-[#E8DCC8] disabled:opacity-50'
                }`}
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : success ? <CheckCircle2 size={13} /> : <UserPlus size={13} />}
                {sending ? 'Sending...' : success ? 'Invite sent' : 'Send invite'}
              </button>
            </form>
          </section>

          {/* Preferences */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <SettingsIcon size={14} className="text-[#5a5142]" />
              <h2 className="text-[12px] font-medium text-[#E8DCC8]">Preferences</h2>
            </div>
            <div className="border border-[#1a160f] rounded-lg divide-y divide-[#161310]">
              <ToggleRow title="Lossless exports" description="Prefer WAV/AIFF for shared links" defaultOn />
              <ToggleRow title="Auto-tagging" description="AI analysis tags on upload" defaultOn={false} />
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ToggleRow({ title, description, defaultOn = false }: { title: string; description: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[#0c0a08] transition-colors cursor-pointer" onClick={() => setOn(!on)}>
      <div>
        <p className="text-[12px] font-medium text-[#E8DCC8]">{title}</p>
        <p className="text-[10px] text-[#5a5142] mt-0.5">{description}</p>
      </div>
      <div className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-[#D4BFA0]' : 'bg-[#1a160f] border border-[#2d2620]'}`}>
        <div className={`w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all ${on ? 'right-[3px] bg-white' : 'left-[3px] bg-[#5a5142]'}`} />
      </div>
    </div>
  );
}
