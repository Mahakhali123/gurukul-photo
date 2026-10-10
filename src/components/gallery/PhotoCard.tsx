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
  const fallbackUnsplash =
    'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=800&auto=format&fit=crop';
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

  // NOTE: locale is pinned to en-IN — using the browser default (undefined)
  // renders differently on server vs client and crashes hydration.
  const formattedDate = photo.createdTime
    ? new Date(photo.createdTime).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      onClick={() => onClick(index)}
      className="gk-card img-zoom-container group w-full min-w-0 cursor-pointer"
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-[#eff2f6]">
        {isAudio ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#212529] p-3 text-white">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#cc0000]">
              <Music className="h-7 w-7 text-white" />
            </span>
            <span className="mt-3 max-w-full truncate px-2 text-[14px]" title={photo.name}>
              {cleanName}
            </span>
            <span className="mt-1 text-[12px] uppercase tracking-[0.12em] text-white/70">
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
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        <span className="absolute left-0 top-3 z-20 max-w-[calc(100%-24px)] truncate bg-[#cc0000] px-3 py-1 text-[12px] uppercase tracking-[0.1em] text-white">
          {photo.category}
        </span>

        {isVideo && (
          <>
            <span className="absolute right-3 top-3 z-20 bg-[#212529] px-3 py-1 text-[12px] uppercase tracking-[0.1em] text-white">
              Video
            </span>
            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-black/40">
                <span className="ml-1 h-0 w-0 border-b-[8px] border-l-[14px] border-t-[8px] border-b-transparent border-l-white border-t-transparent" />
              </span>
            </span>
          </>
        )}

        {isAudio && (
          <span className="absolute right-3 top-3 z-20 bg-[#cc0000] px-3 py-1 text-[12px] uppercase tracking-[0.1em] text-white">
            Audio
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 z-20 hidden items-end justify-between bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:flex">
          <p className="truncate pr-4 text-[14px] text-white">{cleanName}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick(index);
              }}
              className="flex h-9 w-9 items-center justify-center bg-white/20 text-white transition-colors hover:bg-white hover:text-[#212529]"
              aria-label="View"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={handleDownload}
              className="flex h-9 w-9 items-center justify-center bg-white/20 text-white transition-colors hover:bg-[#cc0000]"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {badgeText && (
          <span
            className="absolute bottom-3 right-3 z-20 bg-[#212529]/85 px-2.5 py-1 text-[12px] text-white"
            title="Face-match confidence"
          >
            {badgeText}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <p className="truncate font-title text-[18px] leading-[26px] text-black" title={photo.name}>
          {cleanName}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 truncate text-[#6c757d]">
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-[13px]" title={photo.albumName}>
              {photo.albumName}
            </span>
          </span>
          {formattedDate && (
            <span className="shrink-0 text-[12px] text-[#6c757d]">{formattedDate}</span>
          )}
        </div>
      </div>
    </div>
  );
}
