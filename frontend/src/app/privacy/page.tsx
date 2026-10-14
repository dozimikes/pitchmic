import type { Metadata } from 'next';
import PrivacyClient from './PrivacyClient';

export const metadata: Metadata = {
  title: 'Privacy Policy | Pitchmic',
  description:
    'Learn how Pitchmic protects founder pitch documents, cap table financials, diligence room telemetry, and personal data under NDPR, GDPR, and global data privacy standards.',
  openGraph: {
    title: 'Privacy Policy | Pitchmic',
    description:
      'Learn how Pitchmic protects founder pitch documents, cap table financials, and diligence room telemetry under NDPR, GDPR, and international data standards.',
    url: '/privacy',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return <PrivacyClient />;
}
