'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Album, PhotoCategory } from '@/types';
import { AlbumGrid } from '@/components/albums/AlbumGrid';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/EmptyState';

const ALBUM_CATEGORIES: { label: string; value: PhotoCategory }[] = [
  { label: 'All Albums', value: 'all' },
  { label: 'Events', value: 'events' },
  { label: 'Activities', value: 'activities' },
  { label: 'Competitions', value: 'competitions' },
  { label: 'Celebrations', value: 'celebrations' },
  { label: 'Classes', value: 'classes' },
  { label: 'Sports', value: 'sports' },
  { label: 'Spiritual', value: 'spiritual' },
];

function AlbumsContent() {
  const searchParams = useSearchParams();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialCat = (searchParams.get('category') as PhotoCategory) || 'all';
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory>(initialCat);
  const [searchQuery, setSearchQuery] = useState('');

  const loadAlbums = async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch('/api/albums', { signal: controller.signal });
      if (!res.ok) throw new Error(`Albums server responded ${res.status}. First load after deploy can take ~30s — please tap Retry.`);
      const data = await res.json();
      if (data.success) {
        setAlbums(data.data || []);
      } else {
        throw new Error(data.error || 'Failed to load albums');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Taking longer than expected — the server is still warming up. Please tap Retry; the second attempt is usually instant.');
      } else {
        setError(err.message || 'Unable to load albums');
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, []);

  const filteredAlbums = useMemo(() => {
    return albums.filter((album) => {
      const matchesCategory = selectedCategory === 'all' || album.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        album.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        album.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [albums, selectedCategory, searchQuery]);

  return (
    <div className="bg-white">
      {/* Page head */}
      <div className="border-b border-[#dddddd] bg-[#eff2f6]">
        <div className="gk-container py-12 lg:pt-[90px]">
          <span className="eyebrow">Collections</span>
          <h1 className="h1-common mt-3">Albums &amp; Events</h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.75]">
            Explore curated collections from Annual Day, Sports Day, cultural
            programs, competitions and celebrations — grouped for easy browsing.
          </p>
        </div>
      </div>

      <div className="gk-container space-y-8 pb-16 pt-10">
        {/* Search + count */}
        <div className="border border-[#dddddd] p-5">
          <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cc0000]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search albums..."
                className="gk-field pl-11 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6c757d] hover:text-[#212529]"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <span className="text-[16px] text-[#6c757d]">
              {filteredAlbums.length} {filteredAlbums.length === 1 ? 'album' : 'albums'} found
            </span>
          </div>

          <div className="no-scrollbar mt-5 flex items-center gap-3 overflow-x-auto border-t border-[#dddddd] pt-5">
            {ALBUM_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
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
          </div>
        </div>

        {loading ? (
          <div className="pt-12"><LoadingSpinner label="Loading albums..." /></div>
        ) : error ? (
          <ErrorMessage message={error} onRetry={loadAlbums} />
        ) : (
          <AlbumGrid
            albums={filteredAlbums}
            onResetFilters={() => {
              setSelectedCategory('all');
              setSearchQuery('');
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function AlbumsPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Loading albums..." />}>
      <AlbumsContent />
    </Suspense>
  );
}
