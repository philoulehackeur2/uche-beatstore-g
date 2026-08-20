import { notFound } from 'next/navigation';
import { CoverArtStudio } from '@/components/cover-art/CoverArtStudio';
import { canAccessDesignSystemLab } from '@/design-system/dev-access';

export const metadata = {
  title: 'Beatstor Design System Lab',
};

export default function DesignSystemLabPage() {
  if (!canAccessDesignSystemLab()) notFound();
  return <CoverArtStudio surface="dev-lab" />;
}
