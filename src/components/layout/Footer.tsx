'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Camera, Facebook, Instagram, Youtube, Twitter, Send, MapPin, Mail, CheckCircle2 } from 'lucide-react';

export function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer className="relative mt-20 overflow-hidden bg-slate-950 text-white">
      {/* Premium gradient background & Decorative Orbs */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -left-[10%] top-0 h-[600px] w-[600px] rounded-full bg-orange-600/10 blur-[120px]" />
        <div className="absolute -right-[10%] bottom-0 h-[600px] w-[600px] rounded-full bg-amber-600/10 blur-[120px]" />
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
      </div>

      {/* Gold top border */}
      <div className="relative z-10 h-1 w-full bg-gradient-to-r from-orange-600 via-amber-400 to-orange-600" />

      {/* Newsletter Band - Full width */}
      <div className="relative z-10 border-b border-white/5 bg-white/[0.02] py-16 backdrop-blur-sm">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-8 lg:flex-row">
            <div className="max-w-xl text-center lg:text-left">
              <span className="inline-block rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold tracking-wider text-orange-300">
                STAY UPDATED
              </span>
              <h3 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Get the latest memories delivered.
              </h3>
              <p className="mt-3 text-base text-slate-400">
                Subscribe to receive notifications when new event albums are published by the Gurukul team.
              </p>
            </div>
            <form
              className="w-full max-w-md shrink-0"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) setSubscribed(true);
              }}
            >
              {subscribed ? (
                <div className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm font-medium text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                  <CheckCircle2 className="h-6 w-6 shrink-0" />
                  <p>You&apos;re on the list — Jay Swaminarayan!</p>
                </div>
              ) : (
                <div className="group relative flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 p-2 pl-6 transition-all duration-300 focus-within:border-orange-500/50 focus-within:bg-white/10 focus-within:shadow-[0_0_25px_rgba(249,115,22,0.15)] hover:border-white/20">
                  <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-orange-400 transition-colors" />
                  <input
                    id="footer-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address..."
                    className="flex-1 bg-transparent py-2 text-base text-white placeholder:text-slate-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Subscribe"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg transition-all hover:scale-105 hover:shadow-orange-500/25 active:scale-95"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          
          {/* Brand Column */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <Link href="/" className="group flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-transform duration-300 group-hover:scale-105 group-hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]">
                <Camera className="h-7 w-7" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="bg-gradient-to-r from-orange-300 via-amber-100 to-orange-300 bg-[length:200%_auto] bg-clip-text text-2xl font-black tracking-tight text-transparent transition-all duration-500 hover:bg-[100%_center]">
                  Gurukul
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400/80">
                  Swaminarayan Gurukul
                </span>
              </div>
            </Link>
            <p className="mt-6 text-sm leading-relaxed text-slate-400">
              The official student photography archive — Vidya, Sadvidya, Brahmavidya. Preserving timeless memories and celebrating moments since 1948.
            </p>
            
            {/* Social Links */}
            <div className="mt-8 flex gap-4">
              {[
                { icon: Facebook, href: 'https://facebook.com/gurukul.org', label: 'Facebook' },
                { icon: Instagram, href: 'https://instagram.com/gurukul_org', label: 'Instagram' },
                { icon: Youtube, href: 'https://youtube.com/gurukulevents', label: 'YouTube' },
                { icon: Twitter, href: 'https://twitter.com/gurukul_org', label: 'X (Twitter)' },
              ].map(({ icon: Icon, href, label }) => (
                <div key={label} className="group relative">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-400 hover:shadow-[0_0_15px_rgba(249,115,22,0.4)]"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Links Column 1 */}
          <div className="flex flex-col items-center lg:items-start lg:pl-8">
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-amber-400/90">Gallery</h4>
            <ul className="flex flex-col items-center space-y-4 text-base text-slate-400 lg:items-start">
              <li>
                <Link href="/photos" className="inline-block transition-all hover:-translate-y-0.5 hover:text-white">All Photos</Link>
              </li>
              <li>
                <Link href="/albums" className="inline-block transition-all hover:-translate-y-0.5 hover:text-white">Albums</Link>
              </li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div className="flex flex-col items-center lg:items-start">
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-amber-400/90">Explore</h4>
            <ul className="flex flex-col items-center space-y-4 text-base text-slate-400 lg:items-start">
              <li>
                <Link href="/photos" className="inline-block transition-all hover:-translate-y-0.5 hover:text-white">Latest Photos</Link>
              </li>
              <li>
                <Link href="/albums" className="inline-block transition-all hover:-translate-y-0.5 hover:text-white">Popular Albums</Link>
              </li>
              <li>
                <a href="https://gurukul.org/admissions/" target="_blank" rel="noreferrer" className="inline-block transition-all hover:-translate-y-0.5 hover:text-white">Admissions</a>
              </li>
            </ul>
          </div>

          {/* Contact Column */}
          <div className="flex flex-col items-center lg:items-start">
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-amber-400/90">Contact</h4>
            <div className="flex flex-col space-y-4 w-full max-w-xs">
              <div className="group flex items-start gap-4 rounded-xl border border-white/5 bg-white/5 p-4 transition-colors hover:border-white/10 hover:bg-white/10">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 transition-colors group-hover:bg-orange-500 group-hover:text-white">
                  <MapPin className="h-5 w-5" />
                </div>
                <p className="text-sm leading-relaxed text-slate-300">
                  Shree Swaminarayan Gurukul,<br />Bangalore, India
                </p>
              </div>
              
              <a href="mailto:garts@gurukul.org" className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 p-4 transition-colors hover:border-white/10 hover:bg-white/10">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 transition-colors group-hover:bg-amber-500 group-hover:text-white">
                  <Mail className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-slate-300 group-hover:text-white">
                  garts@gurukul.org
                </span>
              </a>

              <a href="https://gurukul.org" target="_blank" rel="noreferrer" className="group flex items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 transition-all hover:bg-orange-500/20">
                <span className="text-sm font-bold text-orange-400 group-hover:text-orange-300">Visit Gurukul.org</span>
                <span className="text-orange-400 transition-transform group-hover:translate-x-1">→</span>
              </a>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Copyright Bar */}
      <div className="relative z-10 border-t border-white/10 bg-slate-950/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
          <p className="text-center text-sm text-slate-400 sm:text-left">
            © {new Date().getFullYear()} Swaminarayan Gurukul. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Built with</span>
            <span className="text-red-500 animate-pulse">❤️</span>
            <span>by Gurukul</span>
          </div>
          <div className="flex gap-6 text-sm">
            <a href="https://gurukul.org/privacy/" target="_blank" rel="noreferrer" className="text-slate-400 transition-colors hover:text-white">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
