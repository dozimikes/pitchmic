import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Sign In to Pitchmic',
  description:
    'Sign in to your Pitchmic account to access your fundability score, evidence vault, funding opportunities, and improvement plan.',
  canonicalPath: '/sign-in',
  keywords: ['pitchmic login', 'sign in pitchmic', 'startup tool login'],
  noIndex: false,
});
