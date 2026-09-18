import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#16294d',
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
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-screen flex flex-col antialiased bg-white text-[#1e293b] font-sans selection:bg-[#ea580c] selection:text-white">
        <Header />
        <main className="flex-1 bg-white">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
