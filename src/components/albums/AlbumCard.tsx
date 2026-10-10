'use client';

import React from 'react';
import Link from 'next/link';
import { Music, ArrowRight, CalendarDays } from 'lucide-react';
import { Album } from '@/types';
import { formatEventDate } from '@/lib/formatDate';

interface AlbumCardProps {
  album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const fallbackCover =
    'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800&auto=format&fit=crop';
  const GTL_ID = '17aUq0tbmExJFFmNFR61SyBqbzcWElv-6';
  const gtlPoster = '/gtl-main.jpg';
  const isGTL =
    album.id === GTL_ID || album.folderId === GTL_ID || album.name.toLowerCase().includes('gtl');
  const displayName = isGTL ? 'GTL' : album.name;
  const coverUrl = isGTL
    ? gtlPoster
    : album.coverPhotoUrl || album.coverPhoto?.directUrl || fallbackCover;
  const totalItems = album.photoCount + (album.videoCount || 0) + (album.audioCount || 0);
  const audioCount = album.audioCount || 0;
  const isAudioOnly =
    !isGTL &&
    !album.coverPhotoUrl &&
    (album.coverPhoto?.mediaType === 'audio' ||
      (totalItems > 0 && album.photoCount === 0 && (album.videoCount || 0) === 0));

  return (
    <Link href={`/albums/${album.id}`} className="gk-card img-zoom-container group flex flex-col">
      <div className="relative aspect-[3/2] overflow-hidden bg-[#eff2f6]">
        {isAudioOnly ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#212529] text-white">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#cc0000]">
              <Music className="h-6 w-6 text-white" />
            </span>
            <span className="mt-2 text-[14px]">
              {audioCount} {audioCount === 1 ? 'audio' : 'audios'}
            </span>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverUrl}
            alt={displayName}
            title={displayName}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== fallbackCover) target.src = fallbackCover;
            }}
            className="h-full w-full object-cover"
          />
        )}

        {album.category && (
          <span className="absolute left-0 top-4 bg-[#cc0000] px-3 py-1 text-[13px] uppercase tracking-[0.1em] text-white">
            {album.category}
          </span>
        )}

        <span className="absolute right-3 top-3 rounded-[5px] bg-white/95 px-3 py-1 text-[13px] text-[#212529]">
          {totalItems} {totalItems === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-2 text-[15px] text-[#6c757d]">
          <CalendarDays className="h-4 w-4 text-[#cc0000]" />
          {formatEventDate(album.date || album.createdTime)}
        </p>

        <h3
          className="mt-1 line-clamp-2 font-title text-[25px] leading-[32px] text-black"
          title={displayName}
        >
          {displayName}
        </h3>

        <p className="mt-2 line-clamp-2 flex-1 text-[16px] leading-[28px] text-[#212529]">
          {album.description || 'Collection of memorable moments captured at Gurukul.'}
        </p>

        <span className="mt-5 inline-flex items-center gap-2 text-[16px] font-medium text-[#cc0000] group-hover:underline">
          View Album <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
