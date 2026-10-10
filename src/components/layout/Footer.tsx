'use client';

import React from 'react';
import Link from 'next/link';
import { Facebook, Instagram, Youtube, Twitter, MapPin, Mail, Phone } from 'lucide-react';

const GURUKUL_LOGO =
  'https://gurukul.org/wp-content/uploads/2023/09/head-logo-1.svg';

const GALLERY_LINKS = [
  { label: 'Gallery Home', href: '/' },
  { label: 'Albums', href: '/albums' },
  { label: 'Photos', href: '/photos' },
];

const GURUKUL_LINKS = [
  { label: 'Why Swaminarayan Gurukul ?', href: 'https://gurukul.org/why-swaminarayan-gurukul/' },
  { label: 'Our Branches', href: 'https://gurukul.org/our-branches/' },
  { label: 'Admissions', href: 'https://gurukul.org/admissions/' },
  { label: 'Events', href: 'https://gurukul.org/events/' },
  { label: 'Blog', href: 'https://gurukul.org/blog/' },
];

const SOCIALS = [
  { icon: Facebook, href: 'https://facebook.com/gurukul.org', label: 'Facebook' },
  { icon: Instagram, href: 'https://instagram.com/gurukul_org', label: 'Instagram' },
  { icon: Youtube, href: 'https://youtube.com/gurukulevents', label: 'YouTube' },
  { icon: Twitter, href: 'https://twitter.com/gurukul_org', label: 'X (Twitter)' },
];

export function Footer() {
  return (
    <footer className="gk-footer mt-20">
      {/* Campus-visit band */}
      <div className="gk-container">
        <div className="flex flex-col items-center justify-between gap-6 border-b border-white/15 pb-12 text-center lg:flex-row lg:text-left">
          <div>
            <h3 className="h3-common !text-white">Book a campus visit today</h3>
            <p className="mt-2 text-[17px]">
              See where these moments are made — Vidya, Sadvidya, Brahmavidya.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="tel:+918046805555" className="gk-btn gk-btn-primary">
              <Phone className="h-4 w-4" />
              Call us
            </a>
            <a
              href="https://gurukul.org/admissions/"
              target="_blank"
              rel="noreferrer"
              className="gk-btn gk-btn-ghost-light"
            >
              Apply Online
            </a>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="gk-container pt-12">
        <div className="flex justify-center">
          <span className="inline-flex items-center justify-center rounded-[10px] bg-white px-6 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GURUKUL_LOGO}
              alt="Shree Swaminarayan Gurukul International School"
              className="h-[72px] w-auto object-contain"
            />
          </span>
        </div>
      </div>

      {/* Link rows */}
      <div className="gk-container pt-10">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[16px]">
          {GALLERY_LINKS.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[15px] text-white/70">
          {GURUKUL_LINKS.map((item) => (
            <li key={item.href}>
              <a href={item.href} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Contact + socials */}
      <div className="gk-container pt-10">
        <div className="flex flex-col items-center gap-6 text-[16px] sm:flex-row sm:justify-center sm:gap-10">
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#cc0000]" />
            Shree Swaminarayan Gurukul, Bangalore, India
          </span>
          <a href="mailto:garts@gurukul.org" className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#cc0000]" />
            garts@gurukul.org
          </a>
        </div>

        <div className="gk-footer-social mt-8 flex items-center justify-center gap-4 pb-8">
          {SOCIALS.map(({ icon: Icon, href, label }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}>
              <Icon className="h-[18px] w-[18px]" />
            </a>
          ))}
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/15">
        <div className="gk-container copy-right flex flex-col items-center justify-between gap-2 text-[15px] sm:flex-row">
          <p className="!text-white/80">
            © {new Date().getFullYear()} Shree Swaminarayan Gurukul. All rights reserved.
          </p>
          <a href="https://gurukul.org" target="_blank" rel="noreferrer">
            gurukul.org
          </a>
        </div>
      </div>
    </footer>
  );
}
