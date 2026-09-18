import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  FolderOpen,
  CalendarDays,
  Search,
  Download,
  ShieldCheck,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { getDriveData } from '@/lib/drive';
import { PhotoGrid } from '@/components/gallery/PhotoGrid';
import { AlbumGrid } from '@/components/albums/AlbumGrid';
import { MotionDiv, MotionH1, MotionP, MotionSpan } from '@/components/Motion';

export const revalidate = 600;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const fadeUpItem = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export default async function HomePage() {
  const data = await getDriveData();
  const { photos, albums } = data;

  const totalPhotos = photos.length;
  const totalAlbums = albums.length;
  const latestPhotos = photos.slice(0, 8);
  const featuredAlbums = albums.slice(0, 3);
  const recentEvents = [...albums]
    .sort(
      (a, b) =>
        new Date(b.date || b.createdTime).getTime() -
        new Date(a.date || a.createdTime).getTime()
    )
    .slice(0, 3);

  return (
    <div className="bg-white">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-[#fffbf5]">
        {/* Animated gradient washes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse-slow"
          style={{
            background:
              'radial-gradient(600px 320px at 12% 0%, rgba(249,115,22,0.12), transparent 60%), radial-gradient(700px 360px at 90% 10%, rgba(201,162,39,0.12), transparent 60%), radial-gradient(800px 400px at 50% 110%, rgba(22,41,77,0.06), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-[1200px] px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* Copy */}
            <MotionDiv
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="text-center lg:text-left"
            >
              <MotionDiv variants={fadeUpItem} className="eyebrow justify-center lg:justify-start flex items-center">
                <span className="w-8 h-[2px] bg-gradient-to-r from-[#ea580c] to-[#c9a227] mr-3"></span>
                Swaminarayan Gurukul
              </MotionDiv>
              
              <MotionH1 variants={fadeUpItem} className="mt-4 text-[38px] font-extrabold leading-[1.05] text-[#16294d] sm:text-[54px] lg:text-[60px]">
                Gurukul Student
                <br />
                <span className="bg-gradient-to-r from-[#ea580c] to-[#c9a227] bg-clip-text text-transparent">
                  Photo Gallery
                </span>
              </MotionH1>
              
              <MotionP variants={fadeUpItem} className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-[#475569] sm:text-[18px] lg:mx-0">
                Capturing and preserving memorable moments of our students at
                Swaminarayan Gurukul.
              </MotionP>

              <MotionDiv variants={fadeUpItem} className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link href="/albums" className="btn-saffron w-full sm:w-auto bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white rounded-full px-6 py-3 font-semibold shadow-md hover:shadow-lg transition flex items-center justify-center">
                  <FolderOpen className="mr-2 h-4 w-4" />
                  View Albums
                </Link>
                <Link href="/photos" className="btn-outline w-full sm:w-auto border-2 border-[#16294d] text-[#16294d] rounded-full px-6 py-3 font-semibold hover:bg-[#16294d] hover:text-white transition flex items-center justify-center">
                  Explore Photos
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </MotionDiv>

              {/* Search hint */}
              <MotionDiv variants={fadeUpItem}>
                <Link
                  href="/photos"
                  className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-full border border-[#e6eaf1] bg-white px-5 py-3 text-left shadow-sm transition hover:border-[#fed7aa] hover:shadow-md lg:mx-0"
                >
                  <Search className="h-4 w-4 shrink-0 text-[#ea580c]" />
                  <span className="truncate text-[14px] text-[#94a3b8]">
                    Search photos, students, events or albums…
                  </span>
                </Link>
              </MotionDiv>

              {/* Stats */}
              <MotionDiv variants={fadeUpItem} className="mt-7 grid grid-cols-3 gap-3 sm:mx-auto sm:max-w-md lg:mx-0">
                {[
                  { value: totalPhotos.toLocaleString('en-IN'), label: 'Total Photos' },
                  { value: totalAlbums.toLocaleString('en-IN'), label: 'Total Albums' },
                  { value: `${recentEvents.length > 0 ? recentEvents.length : albums.length}`, label: 'Recent Events' },
                ].map((s) => (
                  <div key={s.label} className="stat-card !p-4 rounded-xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm">
                    <p className="text-[22px] font-extrabold bg-gradient-to-br from-[#16294d] to-[#3b82f6] bg-clip-text text-transparent sm:text-[26px]">
                      {s.value}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-[#ea580c]">
                      {s.label}
                    </p>
                  </div>
                ))}
              </MotionDiv>
            </MotionDiv>

            {/* Hero visual */}
            <MotionDiv
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative"
            >
              <div className="overflow-hidden rounded-[24px] border border-[#ffedd5] shadow-[0_24px_60px_-20px_rgba(234,88,12,0.35)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero-main.jpg"
                  alt="Students of Swaminarayan Gurukul"
                  className="h-auto w-full object-cover"
                />
              </div>
              {/* gold ring accent */}
              <div
                aria-hidden
                className="absolute -right-4 -top-4 -z-10 h-28 w-28 rounded-full border-[10px] border-[#fde68a] animate-spin-slow"
              />
            </MotionDiv>
          </div>

          {/* trust strip */}
          <MotionDiv 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-[#f1e8d5] pt-6 text-[12px] font-semibold text-[#64748b] lg:justify-start"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#c9a227]" /> Official Gurukul archive
            </span>
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#ea580c]" /> New moments added regularly
            </span>
            <span className="flex items-center gap-2">
              <Download className="h-4 w-4 text-[#16294d]" /> Full-resolution downloads
            </span>
          </MotionDiv>
        </div>
      </section>

      {/* ================= FILTER SHORTCUTS ================= */}
      <section className="mx-auto max-w-[1200px] px-4 pt-10 sm:px-6">
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-2">
          <span className="shrink-0 text-[12px] font-bold uppercase tracking-widest text-[#64748b] mr-2">
            Browse:
          </span>
          {[
            { label: 'All', href: '/photos' },
            { label: 'Events', href: '/photos?category=events' },
            { label: 'Activities', href: '/photos?category=activities' },
            { label: 'Competitions', href: '/photos?category=competitions' },
            { label: 'Celebrations', href: '/photos?category=celebrations' },
            { label: 'Classes', href: '/photos?category=classes' },
          ].map((f) => (
            <Link
              key={f.label}
              href={f.href}
              className="shrink-0 rounded-full border border-[#e6eaf1] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#334155] transition-all hover:border-[#ea580c] hover:bg-[#fff7ed] hover:text-[#ea580c]"
            >
              {f.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ================= ALBUMS FIRST ================= */}
      <section className="mt-10 bg-[#fffbf5] py-20">
        <MotionDiv 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="mx-auto max-w-[1200px] px-4 sm:px-6"
        >
          <MotionDiv variants={fadeUpItem} className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Curated collections</p>
              <h2 className="mt-2 text-[28px] font-extrabold text-[#16294d] sm:text-[36px]">
                Popular Albums
              </h2>
              <div className="gold-divider mt-3" />
              <p className="mt-3 max-w-xl text-[15px] text-[#64748b]">
                Annual Day, Sports Day, cultural programs and more — grouped by event
                and celebration.
              </p>
            </div>
            <Link
              href="/albums"
              className="hidden shrink-0 items-center gap-1 text-[14px] font-bold text-[#ea580c] hover:underline sm:inline-flex"
            >
              View all albums ({totalAlbums}) <ChevronRight className="h-4 w-4" />
            </Link>
          </MotionDiv>
          <MotionDiv variants={fadeUpItem} className="pt-10">
            <AlbumGrid albums={featuredAlbums} />
          </MotionDiv>
          <MotionDiv variants={fadeUpItem} className="pt-10 text-center">
            <Link href="/albums" className="btn-navy inline-flex items-center justify-center rounded-full bg-[#16294d] px-7 py-3 font-semibold text-white transition hover:bg-[#1d3560] shadow-md">
              Explore all {totalAlbums} albums <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </MotionDiv>
        </MotionDiv>
      </section>

      {/* ================= LATEST PHOTOS ================= */}
      <section className="mx-auto max-w-[1200px] px-4 pt-12 sm:px-6">
        <MotionDiv 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <MotionDiv variants={fadeUpItem} className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Fresh from campus</p>
              <h2 className="mt-2 text-[28px] font-extrabold text-[#16294d] sm:text-[36px]">
                Latest Photos
              </h2>
              <div className="gold-divider mt-3" />
            </div>
            <Link
              href="/photos"
              className="hidden shrink-0 items-center gap-1 text-[14px] font-bold text-[#ea580c] hover:underline sm:inline-flex"
            >
              View all photos ({totalPhotos}) <ChevronRight className="h-4 w-4" />
            </Link>
          </MotionDiv>
          <MotionDiv variants={fadeUpItem} className="pt-6">
            <PhotoGrid photos={latestPhotos} />
          </MotionDiv>
          <MotionDiv variants={fadeUpItem} className="pt-6 text-center sm:hidden">
            <Link href="/photos" className="btn-outline w-full justify-center flex py-3 rounded-full border border-[#16294d] text-[#16294d] font-semibold">
              View all {totalPhotos} photos
            </Link>
          </MotionDiv>
        </MotionDiv>
      </section>

      {/* ================= RECENT EVENTS ================= */}
      <section className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-6">
        <MotionDiv 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <MotionDiv variants={fadeUpItem} className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">What&apos;s new</p>
              <h2 className="mt-2 text-[28px] font-extrabold text-[#16294d] sm:text-[36px]">
                Recent Events
              </h2>
              <div className="gold-divider mt-3" />
            </div>
            <Link
              href="/albums"
              className="hidden shrink-0 items-center gap-1 text-[14px] font-bold text-[#ea580c] hover:underline sm:inline-flex"
            >
              All albums <ChevronRight className="h-4 w-4" />
            </Link>
          </MotionDiv>
          <MotionDiv variants={fadeUpItem} className="grid gap-4 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {recentEvents.map((album) => (
              <Link
                key={album.id}
                href={`/albums/${album.id}`}
                className="inst-card group flex items-center gap-4 p-4 bg-white border border-[#e6eaf1] rounded-2xl shadow-sm hover:shadow-md transition hover:border-[#fed7aa]"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fff7ed] to-[#ffedd5] text-[#ea580c] ring-1 ring-[#fed7aa]">
                  <CalendarDays className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-[#16294d] transition-colors group-hover:text-[#ea580c]">
                    {album.name}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-[#64748b]">
                    {album.photoCount + (album.videoCount || 0) + (album.audioCount || 0)} items
                    {' · '}
                    {new Date(album.date || album.createdTime).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#cbd5e1] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#ea580c]" />
              </Link>
            ))}
            {recentEvents.length === 0 && (
              <p className="col-span-full rounded-2xl border border-dashed border-[#e6eaf1] bg-[#f8fafc] p-8 text-center text-[14px] text-[#64748b]">
                No events yet — please check back soon.
              </p>
            )}
          </MotionDiv>
        </MotionDiv>
      </section>

      {/* ================= CTA ================= */}
      <section className="mx-auto max-w-[1200px] px-4 pb-12 pt-20 sm:px-6">
        <MotionDiv
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#16294d] via-[#1d3560] to-[#0f1e3a] p-8 text-white sm:p-12 shadow-2xl"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(500px 260px at 85% 15%, rgba(234,88,12,0.35), transparent 60%), radial-gradient(400px 240px at 10% 90%, rgba(201,162,39,0.25), transparent 60%)',
            }}
          />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <h2 className="mt-0 !text-white text-[28px] font-extrabold leading-tight sm:text-[40px]">
                Find your moments in seconds.
              </h2>
              <p className="mt-3 text-[15.5px] leading-relaxed text-white/80">
                Search by event, album or name. Open any photo to view in full screen
                or download the original file.
              </p>
            </div>
            <div className="flex w-full flex-col gap-4 sm:flex-row lg:w-auto">
              <Link
                href="/photos"
                className="inline-flex min-h-[52px] items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-[#ea580c] to-[#f97316] px-7 text-[15px] font-semibold text-white shadow-lg transition hover:shadow-xl sm:w-auto"
              >
                <Search className="mr-2 h-4 w-4" /> Search photos
              </Link>
              <Link
                href="/albums"
                className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-white/25 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10"
              >
                View Albums
              </Link>
            </div>
          </div>
        </MotionDiv>
      </section>
    </div>
  );
}
