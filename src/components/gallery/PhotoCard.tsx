'use client';

import React, { useState } from 'react';
import { Download, Music, Eye, Folder } from 'lucide-react';
import { DriveFile } from '@/types';

interface PhotoCardProps {
  photo: DriveFile;
  index: number;
  onClick: (index: number) => void;
  /** Optional small confidence chip (e.g. face-match %) shown bottom-right. */
  badgeText?: string;
}

export function PhotoCard({ photo, index, onClick, badgeText }: PhotoCardProps) {
  const fallbackUnsplash = 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800&auto=format&fit=crop';
  const [imgSrc, setImgSrc] = useState(photo.thumbnailLink || photo.directUrl || fallbackUnsplash);
  const [fallbackStep, setFallbackStep] = useState(0);

  const isVideo = photo.mediaType === 'video';
  const isAudio = photo.mediaType === 'audio';

  const handleImgError = () => {
    if (fallbackStep === 0) {
      setFallbackStep(1);
      setImgSrc(`https://drive.google.com/thumbnail?id=${photo.id}&sz=w800`);
    } else if (fallbackStep === 1) {
      setFallbackStep(2);
      setImgSrc(`https://drive.google.com/uc?export=view&id=${photo.id}`);
    } else if (fallbackStep === 2) {
      setFallbackStep(3);
      setImgSrc(`https://lh3.googleusercontent.com/d/${photo.id}=w800`);
    } else {
      setImgSrc(fallbackUnsplash);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const downloadUrl = `/api/download?id=${photo.id}&name=${encodeURIComponent(photo.name)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = photo.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cleanName = photo.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  
  // Format the date nicely if createdTime is available.
  // NOTE: locale is pinned to en-IN — using the browser default (undefined)
  // renders differently on server vs client and crashes hydration.
  const formattedDate = photo.createdTime 
    ? new Date(photo.createdTime).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div
      onClick={() => onClick(index)}
      className="inst-card group w-full min-w-0 cursor-pointer rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="relative w-full aspect-[4/3] rounded-t-2xl overflow-hidden bg-[#e8edf3]">
        {isAudio ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#16294d] to-[#0f1e3a] p-3 text-white absolute inset-0 !animate-none z-10">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#f97316] to-[#c2410c] shadow-lg shadow-[#ea580c]/20">
              <Music className="h-7 w-7 text-white" />
            </span>
            <span className="mt-3 max-w-full truncate px-2 text-[13px] font-medium" title={photo.name}>
              {cleanName}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#fdba74]/80">
              {(photo.name.split('.').pop() || 'audio').toUpperCase()} · Audio
            </span>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imgSrc}
            alt={photo.name}
            title={photo.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={handleImgError}
            // Gentle zoom only — no brightness flash (brightness jumps read as blinking)
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
          />
        )}

        <span className="absolute left-3 top-3 z-20 max-w-[calc(100%-24px)] truncate rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#ea580c] shadow-sm backdrop-blur-md border border-white/30">
          {photo.category}
        </span>

        {isVideo && (
          <>
            <span className="absolute right-3 top-3 z-20 rounded-full bg-[#16294d]/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-md border border-white/10">
              Video
            </span>
            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/40 backdrop-blur-md shadow-2xl transition-transform duration-300 group-hover:scale-110">
                <span className="ml-1 h-0 w-0 border-b-[8px] border-l-[14px] border-t-[8px] border-b-transparent border-l-white border-t-transparent drop-shadow-md" />
              </span>
            </span>
          </>
        )}

        {isAudio && (
          <span className="absolute right-3 top-3 z-20 rounded-full bg-gradient-to-r from-[#f97316] to-[#ea580c] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-md">
            Audio
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 z-20 hidden items-end justify-between bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:flex">
          <p className="truncate pr-4 text-[13px] font-medium text-white/95 drop-shadow-md">
            {cleanName}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick(index);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-white hover:text-[#16294d]"
              aria-label="View"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={handleDownload}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-[#ea580c] hover:text-white"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {badgeText && (
          <span
            className="absolute bottom-3 right-3 z-20 rounded-full bg-[#16294d]/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md border border-white/20 shadow-sm"
            title="Face-match confidence"
          >
            {badgeText}
          </span>
        )}
      </div>

      <div className="min-w-0 px-4 py-3.5 flex flex-col gap-1 rounded-b-2xl">
        <p className="truncate text-[14px] font-bold leading-tight text-[#16294d]" title={photo.name}>
          {cleanName}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate text-[#64748b]">
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <p className="truncate text-[12px] font-medium" title={photo.albumName}>{photo.albumName}</p>
          </div>
          {formattedDate && (
            <span className="shrink-0 text-[11px] text-[#94a3b8] font-medium">
              {formattedDate}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
