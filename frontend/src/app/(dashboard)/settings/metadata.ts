import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Account Settings',
  description:
    'Manage your Pitchmic account - notifications, billing, subscription plan, and connected integrations.',
  canonicalPath: '/settings',
  keywords: ['pitchmic account settings', 'manage subscription pitchmic'],
  noIndex: false,
});
