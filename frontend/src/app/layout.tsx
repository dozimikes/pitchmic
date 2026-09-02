import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pitchmic - Pitch Deck Scoring, Due Diligence & Intelligent Deal Room',
  description:
    'Pitchmic is the due diligence and deal room platform for startups and VCs. Score pitch decks, verify financials, conduct automated screening, and close rounds faster.',
  keywords: [
    'pitch deck scoring',
    'due diligence',
    'venture capital',
    'deal room',
    'startup fundraising',
    'investor matching',
    'fundability score',
  ],
  authors: [{ name: 'Pitchmic' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pitchmic.com',
    title: 'Pitchmic - Pitch Deck Scoring & Intelligent Deal Room',
    description:
      'Score pitch decks, verify financials, conduct automated screening, and close rounds faster.',
    siteName: 'Pitchmic',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/pitchmic-icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/pitchmic-icon.png',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pitchmic - Pitch Deck Scoring & Intelligent Deal Room',
    description: 'Score pitch decks, verify financials, and close rounds faster.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased text-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
