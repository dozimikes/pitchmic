import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Set a New Password | Pitchmic',
  description: 'Choose a new password for your Pitchmic account.',
  canonicalPath: '/reset-password',
  noIndex: true, // token-gated page - no value in indexing
});
