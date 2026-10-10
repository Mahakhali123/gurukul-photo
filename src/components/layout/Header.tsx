'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, Search } from 'lucide-react';

const GURUKUL_LOGO =
  'https://gurukul.org/wp-content/uploads/2023/09/head-logo-1.svg';

const NAV = [
  { label: 'Gallery Home', href: '/' },
  { label: 'Albums', href: '/albums' },
  { label: 'Photos', href: '/photos' },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="gk-header relative">
        <div className="gk-container relative flex min-h-[50px] items-center justify-between gap-4">
          {/* Floating white logo card — overhangs the red bar, as on gurukul.org */}
          <Link
            href="/"
            aria-label="Shree Swaminarayan Gurukul home"
            className="gk-logo-card absolute left-3 top-0 z-10 hidden h-[120px] w-[240px] lg:flex"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GURUKUL_LOGO}
              alt="Shree Swaminarayan Gurukul International School"
              className="h-auto w-full object-contain"
            />
          </Link>

          {/* Compact logo for small screens */}
          <Link
            href="/"
            aria-label="Shree Swaminarayan Gurukul home"
            className="flex items-center rounded bg-white px-3 py-1.5 lg:hidden"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GURUKUL_LOGO}
              alt="Shree Swaminarayan Gurukul International School"
              className="h-9 w-auto object-contain"
            />
          </Link>

          {/* Desktop nav, offset to clear the logo card */}
          <nav
            className="hidden items-center gap-8 lg:flex lg:pl-[260px]"
            aria-label="Primary"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`gk-nav-link ${isActive(item.href) ? 'is-active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/photos"
              className="hidden items-center gap-2 border-2 border-white px-4 py-1.5 font-title text-[17px] leading-7 text-white transition-colors hover:bg-white hover:text-[#cc0000] lg:inline-flex"
            >
              <Search className="h-4 w-4" />
              Find Photos
            </Link>

            <button
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center border border-white/60 text-white transition-colors hover:bg-white hover:text-[#cc0000] lg:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Mobile menu ---------- */}
      {open && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 top-[68px] z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <nav
            className="relative z-50 border-b border-[#dddddd] bg-white"
            aria-label="Mobile"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block border-b border-[#eff2f6] px-5 py-4 font-title text-[20px] ${
                  isActive(item.href) ? 'text-[#cc0000]' : 'text-[#212529]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
