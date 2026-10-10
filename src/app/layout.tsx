import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#cc0000',
};

export const metadata: Metadata = {
  title: 'Gurukul Student Photo Gallery | Swaminarayan Gurukul',
  description:
    'Capturing and preserving memorable moments of our students at Swaminarayan Gurukul. Official student photography archive of Swaminarayan Gurukul.',
  keywords: [
    'Swaminarayan Gurukul',
    'Gurukul Photos',
    'Student Gallery',
    'School Photography',
    'Gurukul Events',
    'Annual Day',
    'Sports Meet',
    'Cultural Fest',
  ],
  authors: [{ name: 'Swaminarayan Gurukul' }],
  openGraph: {
    title: 'Gurukul Student Photo Gallery | Swaminarayan Gurukul',
    description:
      'Capturing and preserving memorable moments of our students at Swaminarayan Gurukul.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Gurukul Photo Gallery',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased bg-white">
        <Header />
        <main className="flex-1 bg-white">{children}</main>
        <a
          href="tel:+918046805555"
          className="gk-phone-fab"
          aria-label="Call Gurukul"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .7-.2 1l-2.3 2.2z" />
          </svg>
        </a>
      </body>
    </html>
  );
}
