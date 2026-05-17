import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StudioWorkstation } from '@/components/studio/StudioWorkstation';

export const dynamic = 'force-dynamic';

export default function StudioPage() {
  return (
    <DashboardLayout>
      <StudioWorkstation />
    </DashboardLayout>
  );
}
