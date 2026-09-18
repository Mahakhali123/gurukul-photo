'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DriveFile, Album, PhotoCategory } from '@/types';
import { GalleryFilterBar } from '@/components/gallery/GalleryFilterBar';
import { PhotoGrid } from '@/components/gallery/PhotoGrid';
import { FindMyPhotosModal } from '@/components/gallery/FindMyPhotosModal';
import { ScanFace } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/EmptyState';

const CATEGORIES: { label: string; value: PhotoCategory }[] = [
  { label: 'All', value: 'all' },
  { label: 'Events', value: 'events' },
  { label: 'Activities', value: 'activities' },
  { label: 'Competitions', value: 'competitions' },
  { label: 'Celebrations', value: 'celebrations' },
  { label: 'Classes', value: 'classes' },
  { label: 'Sports', value: 'sports' },
  { label: 'Spiritual', value: 'spiritual' },
  { label: 'Videos', value: 'videos' },
  { label: 'Audios', value: 'audios' },
];

function PhotosGalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [photos, setPhotos] = useState<DriveFile[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialCategory = (searchParams.get('category') as PhotoCategory) || 'all';
  const initialAlbumId = searchParams.get('albumId') || 'all';
  const initialSearch = searchParams.get('search') || '';
  const initialSort = (searchParams.get('sortBy') as 'newest' | 'oldest' | 'name') || 'newest';
  const initialMediaType = (searchParams.get('type') as 'all' | 'image' | 'video' | 'audio') || 'all';

  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory>(initialCategory);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(initialAlbumId);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video' | 'audio'>(initialMediaType);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>(initialSort);
  const [findMyPhotosOpen, setFindMyPhotosOpen] = useState(false);

  useEffect(() => {
    const cat = searchParams.get('category') as PhotoCategory;
    if (cat) setSelectedCategory(cat);
    const alb = searchParams.get('albumId');
    if (alb) setSelectedAlbumId(alb);
    const s = searchParams.get('search');
    if (s !== null) setSearchQuery(s);
    const t = searchParams.get('type') as 'all' | 'image' | 'video' | 'audio';
    if (t) setMediaTypeFilter(t);
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const [photosRes, albumsRes] = await Promise.all([
        fetch('/api/photos', { signal: controller.signal }),
        fetch('/api/albums', { signal: controller.signal }),
      ]);

      if (!photosRes.ok) throw new Error(`Gallery server responded ${photosRes.status}. First load can take ~30s while the server warms up — please tap Retry.`);
      if (!albumsRes.ok) throw new Error(`Albums server responded ${albumsRes.status}. Please tap Retry.`);

      const photosData = await photosRes.json();
      const albumsData = await albumsRes.json();

      if (photosData.success) {
        setPhotos(photosData.data || []);
      } else {
        throw new Error(photosData.error || 'Failed to fetch media');
      }

      if (albumsData.success) {
        setAlbums(albumsData.data || []);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Taking longer than expected — the server is still warming up. Please tap Retry; the second attempt is usually instant.');
      } else {
        setError(err.message || 'An error occurred while loading gallery');
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredPhotos = useMemo(() => {
    let result = [...photos];

    if (mediaTypeFilter !== 'all') {
      result = result.filter((p) => p.mediaType === mediaTypeFilter);
    }

    if (selectedCategory !== 'all') {
      if (selectedCategory === 'videos') {
        result = result.filter((p) => p.mediaType === 'video');
      } else if (selectedCategory === 'audios') {
        result = result.filter((p) => p.mediaType === 'audio');
      } else {
        result = result.filter((p) => p.category === selectedCategory);
      }
    }

    if (selectedAlbumId !== 'all') {
      result = result.filter((p) => p.albumId === selectedAlbumId);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.albumName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
    } else if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
    }

    return result;
  }, [photos, mediaTypeFilter, selectedCategory, selectedAlbumId, searchQuery, sortBy]);

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedAlbumId('all');
    setMediaTypeFilter('all');
    setSearchQuery('');
    setSortBy('newest');
    router.push('/photos');
  };

  return (
    <div className="bg-white">
      {/* Institutional page hero */}
      <div className="relative border-b border-[#f1e8d5] bg-[#fffbf5] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#e6eaf1_1px,transparent_1px)] [background-size:16px_16px] opacity-60"></div>
        <div className="relative mx-auto max-w-[1200px] px-4 pb-12 pt-16 sm:px-6 sm:pt-20">
          <p className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-widest text-[#ea580c]">
            <span className="h-[2px] w-8 rounded-full bg-gradient-to-r from-[#ea580c] to-transparent"></span>
            Gallery
          </p>
          <h1 className="mt-4 text-[42px] font-extrabold leading-[1.1] tracking-tight sm:text-[64px]">
            <span className="bg-gradient-to-r from-[#16294d] via-[#ea580c] to-[#9a3412] bg-clip-text text-transparent">
              Photo Gallery
            </span>
          </h1>
          
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="animate-fade-in-up flex items-center rounded-full border border-[#fbd38d]/30 bg-white/60 px-4 py-1.5 text-sm font-semibold text-[#16294d] shadow-sm backdrop-blur-md">
              <span className="text-[#ea580c]">{photos.length}</span>
              <span className="ml-1.5 opacity-70">photos</span>
              <span className="mx-2 opacity-30">•</span>
              <span className="text-[#ea580c]">{albums.length}</span>
              <span className="ml-1.5 opacity-70">albums</span>
              <span className="mx-2 opacity-30">•</span>
              <span className="text-[#ea580c]">{albums.filter(a => a.category === 'events').length}</span>
              <span className="ml-1.5 opacity-70">events</span>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-[#475569] sm:text-[18px]">
            Relive the best moments from our campus. Browse through high-quality student photos, videos, and audio highlights from Gurukul events, activities, and celebrations.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-8 px-4 pb-16 pt-8 sm:px-6">
        <div className="flex justify-start sm:justify-end">
          <button
            onClick={() => setFindMyPhotosOpen(true)}
            className="inline-flex w-full min-h-[56px] sm:w-auto items-center justify-center rounded-full bg-gradient-to-r from-[#f97316] to-[#ea580c] px-8 text-base font-bold text-white shadow-[0_8px_20px_-6px_rgba(234,88,12,0.6)] transition-shadow hover:shadow-[0_12px_25px_-6px_rgba(234,88,12,0.7)]"
          >
            <ScanFace className="mr-2.5 h-5 w-5" /> Find My Photos
          </button>
        </div>

        <div className="rounded-[24px] bg-white p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-100">
          <GalleryFilterBar
            categories={CATEGORIES}
            activeCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            mediaTypeFilter={mediaTypeFilter}
            onSelectMediaType={setMediaTypeFilter}
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            onSelectAlbum={setSelectedAlbumId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onResetFilters={handleResetFilters}
            totalPhotosCount={filteredPhotos.length}
          />
        </div>

        {loading ? (
          <div className="pt-12"><LoadingSpinner label="Loading gallery..." /></div>
        ) : error ? (
          <ErrorMessage message={error} onRetry={loadData} />
        ) : (
          <PhotoGrid photos={filteredPhotos} onResetFilters={handleResetFilters} />
        )}

        <FindMyPhotosModal
          isOpen={findMyPhotosOpen}
          onClose={() => setFindMyPhotosOpen(false)}
          photos={photos}
        />
      </div>
    </div>
  );
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Loading gallery..." />}>
      <PhotosGalleryContent />
    </Suspense>
  );
}
