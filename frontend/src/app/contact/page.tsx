import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact & Support Desk | Pitchmic',
  description:
    'Get in touch with the Pitchmic team for founder fundability support, investor relations, accelerator cohorts, NDPR/GDPR compliance, and security disclosures.',
  openGraph: {
    title: 'Contact & Support Desk | Pitchmic',
    description:
      'Connect with Pitchmic’s team for startup fundability, data room inquiries, investor relations, and regulatory compliance.',
    url: '/contact',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ContactPage() {
  return <ContactClient />;
}
