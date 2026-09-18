'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, ChevronRight, Search, Home, Image as ImageIcon, LayoutList } from 'lucide-react';

const GURUKUL_LOGO =
  'https://gurukul.org/wp-content/uploads/2023/09/head-logo-1.svg';

const NAV = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Photos', href: '/photos', icon: ImageIcon },
  { label: 'Albums', href: '/albums', icon: LayoutList },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <header className="sticky top-0 z-50 w-full transition-all duration-300">
      {/* Main header background & container */}
      <div 
        className={`relative z-50 w-full transition-all duration-300 border-b ${
          scrolled || open
            ? 'bg-white/90 backdrop-blur-md shadow-[0_4px_20px_-8px_rgba(22,41,77,0.15)] border-slate-200/50' 
            : 'bg-white/70 backdrop-blur-md border-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-[72px] items-center justify-between gap-4">
            
            {/* Brand Logo Section */}
            <Link 
              href="/" 
              className="group flex items-center gap-3 transition-transform duration-300 hover:scale-[1.02]" 
              onClick={() => setOpen(false)}
              aria-label="Shree Swaminarayan Gurukul home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={GURUKUL_LOGO}
                alt="Shree Swaminarayan Gurukul"
                className="h-11 w-auto object-contain transition-transform duration-500 group-hover:rotate-[3deg]"
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-8" aria-label="Primary">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative py-2 text-[15px] font-semibold transition-colors duration-300 ${
                      active ? 'text-orange-600' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                    {/* Apple-like underline animation */}
                    <span 
                      className={`absolute bottom-0 left-1/2 h-[2.5px] w-full -translate-x-1/2 transform rounded-full bg-orange-500 transition-all duration-300 ease-out ${
                        active 
                          ? 'scale-x-100 opacity-100' 
                          : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-100'
                      }`}
                    />
                  </Link>
                );
              })}
            </nav>
            
            {/* Desktop Right Actions */}
            <div className="flex items-center gap-3">
              <button 
                className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                aria-label="Search"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              
              <Link
                href="/photos"
                className="hidden sm:inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-orange-500/25 transition-all duration-300 hover:scale-[1.03] hover:shadow-orange-500/40"
              >
                View Gallery
                <ChevronRight className="h-4 w-4" />
              </Link>
              
              <button
                onClick={() => setOpen((v) => !v)}
                className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-full border border-slate-200 transition-colors lg:hidden ${
                  open ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
              >
                {open ? <X className="h-5 w-5 transition-transform duration-300 rotate-90" /> : <Menu className="h-5 w-5 transition-transform duration-300" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay and content */}
      <div 
        className={`absolute top-[72px] left-0 w-full lg:hidden overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'h-[100vh] opacity-100' : 'h-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop overlay */}
        <div 
          className={`absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setOpen(false)}
        />
        
        {/* Menu panel */}
        <div 
          className={`relative bg-white/95 backdrop-blur-xl border-b border-slate-200 px-6 py-6 transition-transform duration-500 delay-100 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? 'translate-y-0 shadow-2xl' : '-translate-y-full'
          }`}
        >
          <nav className="flex flex-col gap-2" aria-label="Mobile">
            {NAV.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{ transitionDelay: `${open ? (i * 40) + 150 : 0}ms` }}
                  className={`group flex items-center gap-4 rounded-2xl px-5 py-3.5 text-[15px] font-semibold transition-all duration-300 ${
                    open ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                  } ${
                    isActive(item.href)
                      ? 'bg-orange-50 text-orange-600 shadow-sm shadow-orange-100/50'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 transition-colors ${isActive(item.href) ? 'text-orange-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="h-4 w-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </Link>
              );
            })}
            
            <div 
              className={`mt-4 pt-5 border-t border-slate-100 flex flex-col gap-3 transition-all duration-500 ${
                open ? 'translate-y-0 opacity-100 delay-300' : 'translate-y-4 opacity-0'
              }`}
            >
              <button className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-5 py-3.5 text-left text-[15px] font-semibold text-slate-600 transition-colors hover:bg-slate-100">
                <span className="flex items-center gap-4">
                  <Search className="h-5 w-5 text-slate-400" />
                  Search
                </span>
              </button>
              
              <Link
                href="/photos"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-orange-500/25 transition-all active:scale-95"
              >
                View Gallery
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
