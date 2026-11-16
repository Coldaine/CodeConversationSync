import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Public_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Threadle — Unified Workstream & Intention Map',
  description:
    'Discover multi-host agent sessions and Wispr Flow dictations, verify actual deliverables, and resume unfinished work.',
  openGraph: {
    title: 'Threadle — Unified Workstream & Intention Map',
    description:
      'Discover multi-host agent sessions and Wispr Flow dictations, verify actual deliverables, and resume unfinished work.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Threadle — Unified Workstream & Intention Map',
    description:
      'Discover multi-host agent sessions and Wispr Flow dictations, verify actual deliverables, and resume unfinished work.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-slate-50 text-slate-900 font-sans antialiased selection:bg-blue-100 selection:text-blue-900"
      >
        {children}
      </body>
    </html>
  );
}
