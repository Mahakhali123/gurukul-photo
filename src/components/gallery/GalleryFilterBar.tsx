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
    <div className="w-full min-w-0 border border-[#dddddd] p-5">
      <div className="grid gap-5 md:grid-cols-3">
        {/* Search */}
        <div>
          <label className="gk-label" htmlFor="gallery-search">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cc0000]" />
            <input
              id="gallery-search"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Photos, students, events or albums..."
              className="gk-field pl-11 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6c757d] hover:text-[#212529]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Album */}
        <div>
          <label className="gk-label" htmlFor="gallery-album">
            Album
          </label>
          <div className="relative">
            <select
              id="gallery-album"
              value={selectedAlbumId}
              onChange={(e) => onSelectAlbum(e.target.value)}
              className="gk-field pl-10"
            >
              <option value="all">All Albums</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name} (
                  {album.photoCount + (album.videoCount || 0) + (album.audioCount || 0)})
                </option>
              ))}
            </select>
            <Folder className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cc0000]" />
          </div>
        </div>

        {/* Sort */}
        <div>
          <label className="gk-label" htmlFor="gallery-sort">
            Sort by
          </label>
          <div className="relative">
            <select
              id="gallery-sort"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as 'newest' | 'oldest' | 'name')}
              className="gk-field pl-10"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name (A-Z)</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cc0000]" />
          </div>
        </div>
      </div>

      {/* Media type */}
      {onSelectMediaType && (
        <div className="no-scrollbar mt-5 flex items-center gap-3 overflow-x-auto">
          {(
            [
              { v: 'all', label: 'All media' },
              { v: 'image', label: 'Photos', Icon: ImageIcon },
              { v: 'video', label: 'Videos', Icon: Video },
              { v: 'audio', label: 'Audios', Icon: Music },
            ] as const
          ).map(({ v, label, Icon }: any) => (
            <button
              key={v}
              onClick={() => onSelectMediaType(v)}
              className={`flex shrink-0 items-center gap-2 border px-4 py-2 text-[15px] transition-colors ${
                mediaTypeFilter === v
                  ? 'border-[#212529] bg-[#212529] text-white'
                  : 'border-[#dddddd] bg-white text-[#212529] hover:border-[#cc0000] hover:text-[#cc0000]'
              }`}
            >
              {Icon && <Icon className="h-4 w-4" />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Categories */}
      <div className="no-scrollbar mt-5 flex items-center gap-3 overflow-x-auto border-t border-[#dddddd] pt-5">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => onSelectCategory(cat.value)}
              className={`whitespace-nowrap border px-4 py-2 text-[15px] transition-colors ${
                isActive
                  ? 'border-[#cc0000] bg-[#cc0000] text-white'
                  : 'border-[#dddddd] bg-white text-[#212529] hover:border-[#cc0000] hover:text-[#cc0000]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}

        <span className="ml-auto shrink-0 pl-2 text-[15px] text-[#6c757d]">
          {totalPhotosCount} {totalPhotosCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {hasActiveFilters && (
        <div className="mt-5">
          <button
            onClick={onResetFilters}
            className="inline-flex items-center gap-2 text-[16px] font-medium text-[#cc0000] hover:underline"
          >
            <X className="h-4 w-4" />
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
