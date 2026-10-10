import React from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { getDriveData } from '@/lib/drive';
import { PhotoGrid } from '@/components/gallery/PhotoGrid';
import { AlbumGrid } from '@/components/albums/AlbumGrid';
import { formatEventDate } from '@/lib/formatDate';

export const revalidate = 600;

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800&auto=format&fit=crop';

export default async function HomePage() {
  const data = await getDriveData();
  const { photos, albums } = data;

  const totalPhotos = photos.length;
  const totalAlbums = albums.length;
  const latestPhotos = photos.slice(0, 10);
  const featuredAlbums = albums.slice(0, 3);
  const recentEvents = [...albums]
    .sort(
      (a, b) =>
        new Date(b.date || b.createdTime).getTime() -
        new Date(a.date || a.createdTime).getTime()
    )
    .slice(0, 4);

  return (
    <div className="bg-white">
      {/* ================= HERO ================= */}
      <section className="gk-container pt-10 lg:pt-[90px]">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="eyebrow">Swaminarayan Gurukul</span>
            <h1 className="h1-common mt-3">
              Gurukul Student
              <br />
              <span className="text-[#cc0000]">Photo Gallery</span>
            </h1>
            <p className="mt-5 max-w-xl text-[18px] leading-[1.75]">
              Capturing and preserving memorable moments of our students — every
              event, activity and celebration, kept in one place.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link href="/albums" className="gk-btn gk-btn-primary">
                Browse Albums
              </Link>
              <Link href="/photos" className="gk-btn gk-btn-outline">
                Explore Photos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <Link
              href="/photos"
              className="mt-6 flex max-w-md items-center gap-3 border border-[#dddddd] bg-[#f9f9f9] px-4 py-3"
            >
              <Search className="h-4 w-4 shrink-0 text-[#cc0000]" />
              <span className="truncate text-[15px] text-[#6c757d]">
                Search photos, students, events or albums…
              </span>
            </Link>
          </div>

          <div className="overflow-hidden rounded-[10px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero-main.jpg"
              alt="Students of Swaminarayan Gurukul"
              className="h-auto w-full object-cover"
            />
          </div>
        </div>

        {/* stats strip */}
        <div className="mt-12 grid grid-cols-3 gap-4 border-t border-[#dddddd] pt-8">
          {[
            { value: totalPhotos.toLocaleString('en-IN'), label: 'Photos' },
            { value: totalAlbums.toLocaleString('en-IN'), label: 'Albums' },
            { value: recentEvents.length.toLocaleString('en-IN'), label: 'Recent Events' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-title text-[38px] leading-none text-[#cc0000]">{s.value}</p>
              <p className="mt-2 text-[15px] uppercase tracking-[0.12em] text-[#6c757d]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= RECENT EVENTS — timeline ================= */}
      <section className="mt-20 bg-[#eff2f6] py-16">
        <div className="gk-container">
          <div className="section-titel text-center">
            <span>What&apos;s new</span>
            <h2 className="h2-common">Recent Events</h2>
          </div>
        </div>

        {recentEvents.length > 0 ? (
          <div className="blog-group events-timeline gk-container">
            {recentEvents.map((album) => {
              const when = album.date || album.createdTime;
              const cover =
                album.coverPhotoUrl || album.coverPhoto?.directUrl || FALLBACK_COVER;
              const items =
                album.photoCount + (album.videoCount || 0) + (album.audioCount || 0);

              return (
                <section className="blog-section" key={album.id}>
                  <span className="line" />

                  <div className="img-section">
                    <p className="date">{formatEventDate(when)}</p>
                    <Link href={`/albums/${album.id}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt={album.name} loading="lazy" referrerPolicy="no-referrer" />
                    </Link>
                  </div>

                  <div className="description-group">
                    <div className="description-section">
                      <p className="heading">{album.name}</p>
                      <div className="gk-tag-box">
                        <p>
                          {album.category
                            ? album.category.charAt(0).toUpperCase() + album.category.slice(1)
                            : 'Gurukul'}{' '}
                          · {items} {items === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                      <p className="title">
                        {album.description ||
                          'Collection of memorable moments captured at Swaminarayan Gurukul.'}
                      </p>
                      <Link className="read-more" href={`/albums/${album.id}`}>
                        Read More <span aria-hidden>→</span>
                      </Link>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="gk-container text-center text-[17px] text-[#6c757d]">
            No events yet — please check back soon.
          </div>
        )}

        <div className="gk-container mt-12 text-center">
          <Link href="/albums" className="gk-btn gk-btn-primary">
            View all albums
          </Link>
        </div>
      </section>

      {/* ================= POPULAR ALBUMS ================= */}
      <section className="gk-container pt-20">
        <div className="section-titel flex flex-wrap items-end justify-between gap-4">
          <div>
            <span>Curated collections</span>
            <h2 className="h2-common">Popular Albums</h2>
            <p className="mt-3 max-w-xl text-[17px]">
              Annual Day, Sports Day, cultural programs and more — grouped by event
              and celebration.
            </p>
          </div>
          <Link
            href="/albums"
            className="hidden items-center gap-1 text-[16px] font-medium text-[#cc0000] hover:underline sm:inline-flex"
          >
            View all albums ({totalAlbums}) <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <AlbumGrid albums={featuredAlbums} />

        <div className="pt-10 text-center">
          <Link href="/albums" className="gk-btn gk-btn-dark">
            Explore all {totalAlbums} albums
          </Link>
        </div>
      </section>

      {/* ================= LATEST PHOTOS ================= */}
      <section className="gk-container pt-20">
        <div className="section-titel flex flex-wrap items-end justify-between gap-4">
          <div>
            <span>Fresh from campus</span>
            <h2 className="h2-common">Latest Photos</h2>
          </div>
          <Link
            href="/photos"
            className="hidden items-center gap-1 text-[16px] font-medium text-[#cc0000] hover:underline sm:inline-flex"
          >
            View all photos ({totalPhotos}) <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <PhotoGrid photos={latestPhotos} />

        <div className="pt-8 text-center sm:hidden">
          <Link href="/photos" className="gk-btn gk-btn-outline">
            View all {totalPhotos} photos
          </Link>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="gk-container pt-20">
        <div className="bg-[#cc0000] px-8 py-14 text-center sm:px-12">
          <h2 className="h2-common !text-white">Find your moments in seconds.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-[17px] !text-white/90">
            Search by event, album or name. Open any photo to view it full screen or
            download the original file.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/photos" className="gk-btn bg-white text-[#cc0000] hover:bg-[#333] hover:text-white">
              <Search className="h-4 w-4" /> Search photos
            </Link>
            <Link href="/albums" className="gk-btn gk-btn-ghost-light">
              View Albums
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
