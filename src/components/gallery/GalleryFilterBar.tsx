'use client';

import React from 'react';
import { Search, ArrowUpDown, X, Folder, Video, Image as ImageIcon, Music } from 'lucide-react';
import { Album, PhotoCategory } from '@/types';

interface GalleryFilterBarProps {
  categories: { label: string; value: PhotoCategory }[];
  activeCategory: PhotoCategory;
  onSelectCategory: (category: PhotoCategory) => void;
  mediaTypeFilter?: 'all' | 'image' | 'video' | 'audio';
  onSelectMediaType?: (type: 'all' | 'image' | 'video' | 'audio') => void;
  albums: Album[];
  selectedAlbumId: string;
  onSelectAlbum: (albumId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: 'newest' | 'oldest' | 'name';
  onSortChange: (sort: 'newest' | 'oldest' | 'name') => void;
  onResetFilters: () => void;
  totalPhotosCount: number;
}

export function GalleryFilterBar({
  categories,
  activeCategory,
  onSelectCategory,
  mediaTypeFilter = 'all',
  onSelectMediaType,
  albums,
  selectedAlbumId,
  onSelectAlbum,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  onResetFilters,
  totalPhotosCount,
}: GalleryFilterBarProps) {
  const hasActiveFilters =
    activeCategory !== 'all' ||
    mediaTypeFilter !== 'all' ||
    selectedAlbumId !== 'all' ||
    searchQuery.trim() !== '' ||
    sortBy !== 'newest';

  return (
    <div className="w-full min-w-0 rounded-[20px] border border-[#e6eaf1] bg-white p-3 shadow-[0_4px_18px_-6px_rgba(22,41,77,0.10)] sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#ea580c]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search photos, students, events or albums..."
            className="w-full rounded-full border border-[#e6eaf1] bg-[#f8fafc] py-3 pl-11 pr-10 text-[14px] text-[#16294d] placeholder:text-[#94a3b8] focus:border-[#ea580c] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ea580c]/15 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#16294d]"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {onSelectMediaType && (
            <div className="flex w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-full border border-[#e6eaf1] bg-[#f8fafc] p-1 text-[12px] font-semibold sm:w-auto">
              {(
                [
                  { v: 'all', label: 'All' },
                  { v: 'image', label: 'Photos', Icon: ImageIcon },
                  { v: 'video', label: 'Videos', Icon: Video },
                  { v: 'audio', label: 'Audios', Icon: Music },
                ] as const
              ).map(({ v, label, Icon }: any) => (
                <button
                  key={v}
                  onClick={() => onSelectMediaType(v)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 transition ${
                    mediaTypeFilter === v
                      ? 'bg-[#16294d] text-white shadow'
                      : 'text-[#64748b] hover:text-[#ea580c]'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <div className="relative min-w-0">
              <select
                value={selectedAlbumId}
                onChange={(e) => onSelectAlbum(e.target.value)}
                className="w-full appearance-none truncate rounded-full border border-[#e6eaf1] bg-white py-2.5 pl-9 pr-8 text-[12.5px] font-semibold text-[#16294d] focus:border-[#ea580c] focus:outline-none sm:w-44"
              >
                <option value="all">All Albums</option>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.name} ({album.photoCount + (album.videoCount || 0) + (album.audioCount || 0)})
                  </option>
                ))}
              </select>
              <Folder className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#ea580c]" />
            </div>

            <div className="relative min-w-0">
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as 'newest' | 'oldest' | 'name')}
                className="w-full appearance-none truncate rounded-full border border-[#e6eaf1] bg-white py-2.5 pl-9 pr-8 text-[12.5px] font-semibold text-[#16294d] focus:border-[#ea580c] focus:outline-none sm:w-40"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">Name (A-Z)</option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#ea580c]" />
            </div>

            {hasActiveFilters && (
              <button
                onClick={onResetFilters}
                className="col-span-2 flex items-center justify-center gap-1 rounded-full bg-[#fef2f2] px-4 py-2.5 text-[12.5px] font-bold text-[#dc2626] transition hover:bg-[#fee2e2] sm:col-span-1"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category chips: All | Events | Activities | Competitions | Celebrations | Classes */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar border-t border-[#f1f5f9] pt-3">
        <div className="flex shrink-0 items-center gap-2 py-0.5">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => onSelectCategory(cat.value)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold transition ${
                  isActive
                    ? 'bg-gradient-to-r from-[#f97316] to-[#ea580c] text-white shadow-[0_6px_16px_-6px_rgba(234,88,12,0.6)]'
                    : 'border border-[#e6eaf1] bg-white text-[#475569] hover:border-[#fed7aa] hover:bg-[#fff7ed] hover:text-[#ea580c]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto shrink-0 pl-2 text-[12px] font-medium text-[#94a3b8]">
          {totalPhotosCount} {totalPhotosCount === 1 ? 'item' : 'items'}
        </span>
      </div>
    </div>
  );
}
