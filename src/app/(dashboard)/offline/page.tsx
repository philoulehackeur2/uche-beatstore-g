'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CloudOff, Trash2, Music2, Wifi, WifiOff } from 'lucide-react';
import { listCached, removeCached, clearAllCached, OfflineMeta } from '@/lib/offline/audio-cache';
import { confirmToast } from '@/hooks/useToast';

function formatMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function OfflinePage() {
  const [items, setItems] = useState<OfflineMeta[]>([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await listCached());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    return () => {
      window.removeEventListener('online', upd);
      window.removeEventListener('offline', upd);
    };
  }, []);

  const totalBytes = items.reduce((sum, m) => sum + m.size, 0);

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto px-10 pt-10">
        <div className="flex items-end justify-between mb-8 pb-6 border-b border-[#16130e]">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#5a5142] mb-2">Available offline</p>
            <h1 className="text-[28px] font-medium tracking-tight text-white leading-none">Offline</h1>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider ${
                online
                  ? 'bg-[#0e1f17] border-[#6DC6A4]/30 text-[#6DC6A4]'
                  : 'bg-[#1f0a0a] border-red-900/50 text-red-300'
              }`}
            >
              {online ? <Wifi size={10} /> : <WifiOff size={10} />}
              {online ? 'Online' : 'Offline'}
            </div>
            {items.length > 0 && (
              <button
                onClick={async () => {
                  const ok = await confirmToast(
                    'Clear all cached tracks?',
                    'You\u2019ll need to re-download tracks for offline playback.',
                    { confirmLabel: 'Clear', cancelLabel: 'Keep', danger: true },
                  );
                  if (!ok) return;
                  await clearAllCached();
                  refresh();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#1a160f] bg-[#14110d] text-[#a08a6a] hover:text-red-400 hover:border-red-900/50 text-[11px] font-medium transition-colors"
              >
                <Trash2 size={11} /> Clear all
              </button>
            )}
          </div>
        </div>

        {!loading && items.length === 0 ? (
          <div className="text-center py-32 border border-dashed border-[#1a160f] rounded-lg">
            <CloudOff size={28} className="text-[#3a3328] mx-auto mb-4" />
            <p className="text-sm text-[#E8DCC8] mb-1">Nothing saved offline yet</p>
            <p className="text-[11px] text-[#5a5142]">Tap &ldquo;Save offline&rdquo; on any track to cache it locally</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[#5a5142] mb-4 font-mono uppercase tracking-wider">
              {items.length} track{items.length === 1 ? '' : 's'} · {formatMB(totalBytes)}
            </p>
            <div className="border border-[#16130e] rounded-lg overflow-hidden">
              {items.map((m) => (
                <div
                  key={m.id}
                  className="grid grid-cols-[40px_1fr_120px_120px_60px] items-center gap-4 px-4 h-14 border-b border-[#161310] last:border-b-0 hover:bg-[#101010] transition-colors"
                >
                  <div className="w-8 h-8 rounded bg-[#16130e] border border-[#1a160f] flex items-center justify-center">
                    <Music2 size={12} className="text-[#E8D8B8]" />
                  </div>
                  <p className="text-[12px] text-[#E8DCC8] truncate">{m.title || m.id}</p>
                  <p className="text-[10px] font-mono text-[#5a5142]">{formatMB(m.size)}</p>
                  <p className="text-[10px] font-mono text-[#5a5142]">
                    {new Date(m.cached_at).toLocaleDateString()}
                  </p>
                  <button
                    onClick={async () => {
                      await removeCached(m.id);
                      refresh();
                    }}
                    className="text-[#5a5142] hover:text-red-400 transition-colors flex justify-end"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
