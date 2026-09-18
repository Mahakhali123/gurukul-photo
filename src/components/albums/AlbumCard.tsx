'use client';

import React from 'react';
import Link from 'next/link';
import { Music, ArrowRight, CalendarDays } from 'lucide-react';
import { Album } from '@/types';

interface AlbumCardProps {
  album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const fallbackCover = 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800&auto=format&fit=crop';
  const GTL_ID = '17aUq0tbmExJFFmNFR61SyBqbzcWElv-6';
  const gtlPoster = '/gtl-main.jpg';
  const isGTL = album.id === GTL_ID || album.folderId === GTL_ID || album.name.toLowerCase().includes('gtl');
  const displayName = isGTL ? 'GTL' : album.name;
  const coverUrl = isGTL ? gtlPoster : (album.coverPhotoUrl || album.coverPhoto?.directUrl || fallbackCover);
  const totalItems = album.photoCount + (album.videoCount || 0) + (album.audioCount || 0);
  const audioCount = album.audioCount || 0;
  const isAudioOnly = !isGTL && !album.coverPhotoUrl && (album.coverPhoto?.mediaType === 'audio' || (totalItems > 0 && album.photoCount === 0 && (album.videoCount || 0) === 0));

  return (
    <Link
      href={`/albums/${album.id}`}
      className="inst-card group flex flex-col relative overflow-hidden bg-white rounded-xl transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_12px_40px_-12px_rgba(234,88,12,0.25)] hover:ring-1 hover:ring-[#ea580c]/30"
      style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[#fff7ed]">
        {isAudioOnly ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#16294d] to-[#0f1e3a] text-white transition-transform duration-700 ease-out group-hover:scale-[1.06]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ea580c] shadow-lg shadow-[#ea580c]/20">
              <Music className="h-6 w-6 text-white" />
            </span>
            <span className="mt-2 text-[12px] font-semibold">{audioCount} {audioCount === 1 ? 'audio' : 'audios'}</span>
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
              if (target.src !== fallbackCover) {
                target.src = fallbackCover;
              }
            }}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
        )}
        
        {/* Taller, smoother gradient overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#0f1e3a]/90 via-[#0f1e3a]/40 to-transparent transition-opacity duration-300 group-hover:opacity-100" />
        
        {/* Photo count badge - Glassmorphism */}
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-bold leading-none shadow-sm ring-1 ring-black/5">
          <span className="text-[#ea580c]">{totalItems}</span>
          <span className="text-[#16294d]">{totalItems === 1 ? 'photo' : 'photos'}</span>
        </span>
        
        {/* Category badge */}
        {album.category && (
          <span className="absolute left-3 top-3 rounded-md bg-[#ea580c] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-md">
            {album.category}
          </span>
        )}
        
        {/* Album name overlay */}
        <div className="absolute inset-x-0 bottom-0 p-5 transform transition-transform duration-300 ease-out">
          <h3 className="line-clamp-1 text-xl font-black leading-tight text-white drop-shadow-md" title={displayName}>
            {displayName}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-white/90">
            <CalendarDays className="h-4 w-4 opacity-90" />
            {new Date(album.date || album.createdTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="line-clamp-2 flex-1 text-[14px] leading-relaxed text-[#475569]">
          {album.description || 'Collection of memorable moments captured at Gurukul.'}
        </p>
        
        {/* Subtle separator line between description and actions */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#ea580c] transition-colors group-hover:text-[#c2410c]">
            View Album <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1.5" />
          </span>
          <span className="rounded-full bg-[#fdf6e3] px-3 py-1 text-[11px] font-bold text-[#92600e] ring-1 ring-[#f5e3b3]/70">
            {totalItems} items
          </span>
        </div>
      </div>
    </Link>
  );
}
