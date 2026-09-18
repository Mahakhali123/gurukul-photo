'use client';

import React from 'react';
import { DriveFile } from '@/types';
import { PhotoCard } from './PhotoCard';
import { PhotoLightbox } from './PhotoLightbox';
import { EmptyState } from '../ui/EmptyState';

interface PhotoGridProps {
  photos: DriveFile[];
  onResetFilters?: () => void;
  /** Optional per-photo chip text (photoId → label), e.g. match confidence. */
  badges?: Record<string, string>;
}

export function PhotoGrid({ photos, onResetFilters, badges }: PhotoGridProps) {
  const [activeLightboxIndex, setActiveLightboxIndex] = React.useState<number | null>(null);

  if (photos.length === 0) {
    return <EmptyState onReset={onResetFilters} />;
  }

  return (
    <>
      {/* 2 cols phones · 3-4 tablets · 4-6 desktop */}
      <div className="grid w-full grid-cols-2 items-start gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {photos.map((photo, fullIndex) => {
          return (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={fullIndex}
              onClick={(i) => setActiveLightboxIndex(i)}
              badgeText={badges?.[photo.id]}
            />
          );
        })}
      </div>

      <PhotoLightbox
        photos={photos}
        currentIndex={activeLightboxIndex}
        onClose={() => setActiveLightboxIndex(null)}
        onNavigate={(idx) => setActiveLightboxIndex(idx)}
      />
    </>
  );
}
