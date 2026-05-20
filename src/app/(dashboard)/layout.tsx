import { TopBar } from '@/components/nav/TopBar';
import { PlayerBar } from '@/components/player/PlayerBar';
import { MediaSessionBridge } from '@/components/player/MediaSessionBridge';
import { UploadsTray } from '@/components/upload/UploadsTray';
import { StemWarmup } from '@/components/system/StemWarmup';

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="pt-14 pb-28 min-h-screen">
        {children}
      </main>
      <PlayerBar />
      <MediaSessionBridge />
      <UploadsTray />
      <StemWarmup />
    </div>
  );
}
