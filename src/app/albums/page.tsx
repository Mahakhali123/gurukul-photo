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
      <div className="relative border-b border-[#f1e8d5] bg-[#fffbf5] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#e6eaf1_1px,transparent_1px)] [background-size:16px_16px] opacity-60"></div>
        <div className="relative mx-auto max-w-[1200px] px-4 pb-12 pt-16 sm:px-6 sm:pt-20">
          <p className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-widest text-[#ea580c]">
            <span className="h-[2px] w-8 rounded-full bg-gradient-to-r from-[#ea580c] to-transparent"></span>
            Collections
          </p>
          <h1 className="mt-4 text-[42px] font-extrabold leading-[1.1] tracking-tight sm:text-[64px]">
            <span className="bg-gradient-to-r from-[#16294d] via-[#ea580c] to-[#9a3412] bg-clip-text text-transparent">
              Albums &amp; Events
            </span>
          </h1>
          
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-[#475569] sm:text-[18px]">
            Explore curated collections from Annual Day, Sports Day, cultural programs, competitions, and celebrations — beautifully grouped for easy browsing.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-8 px-4 pb-16 pt-8 sm:px-6">
        <div className="rounded-[24px] bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-100 sm:p-6">
          <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#ea580c]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search albums..."
                className="w-full rounded-2xl border-2 border-transparent bg-slate-50 py-3.5 pl-12 pr-10 text-[15px] font-medium text-[#16294d] placeholder:text-slate-400 transition-all focus:border-[#ea580c]/20 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#ea580c]/10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-start rounded-full bg-slate-50 px-4 py-2 sm:self-center">
              <div className="h-2 w-2 rounded-full bg-[#ea580c] animate-pulse"></div>
              <span className="text-[13px] font-semibold text-slate-600">
                {filteredAlbums.length} {filteredAlbums.length === 1 ? 'album' : 'albums'} found
              </span>
            </div>
          </div>

          <div className="no-scrollbar mt-6 flex items-center gap-2.5 overflow-x-auto border-t border-slate-100 pt-6 pb-2">
            {ALBUM_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`whitespace-nowrap rounded-full px-5 py-2.5 text-[14px] font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#f97316] to-[#ea580c] text-white shadow-[0_8px_20px_-6px_rgba(234,88,12,0.6)] hover:-translate-y-0.5'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-orange-50 hover:text-[#ea580c] hover:ring-[#ea580c]/30'
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
