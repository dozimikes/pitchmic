import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Notifications',
  description:
    'Stay up to date on fundability score changes, new funding opportunity matches, investor activity, and application deadlines.',
  canonicalPath: '/notifications',
  keywords: ['startup funding notifications', 'investor activity alerts'],
  noIndex: false,
});
