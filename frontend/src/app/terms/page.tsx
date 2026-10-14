import type { Metadata } from 'next';
import TermsClient from './TermsClient';

export const metadata: Metadata = {
  title: 'Terms of Service | Pitchmic',
  description:
    'Review the terms governing the use of Pitchmic’s startup fundability intelligence platform, video pitch exchange, electronic diligence data rooms, and term sheet workspaces.',
  openGraph: {
    title: 'Terms of Service | Pitchmic',
    description:
      'Review the terms governing the use of Pitchmic’s startup fundability intelligence platform, video pitch exchange, and diligence data rooms.',
    url: '/terms',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return <TermsClient />;
}
