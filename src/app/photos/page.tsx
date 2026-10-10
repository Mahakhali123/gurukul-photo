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
      {/* Page head */}
      <div className="border-b border-[#dddddd] bg-[#eff2f6]">
        <div className="gk-container py-12 lg:pt-[90px]">
          <span className="eyebrow">Gallery</span>
          <h1 className="h1-common mt-3">Photo Gallery</h1>

          <p className="mt-4 text-[17px] text-[#6c757d]">
            <span className="text-[#cc0000]">{photos.length}</span> photos
            <span className="mx-2 opacity-40">•</span>
            <span className="text-[#cc0000]">{albums.length}</span> albums
            <span className="mx-2 opacity-40">•</span>
            <span className="text-[#cc0000]">
              {albums.filter((a) => a.category === 'events').length}
            </span>{' '}
            events
          </p>

          <p className="mt-5 max-w-2xl text-[18px] leading-[1.75]">
            Relive the best moments from our campus — high-quality student photos,
            videos and audio highlights from Gurukul events, activities and
            celebrations.
          </p>
        </div>
      </div>

      <div className="gk-container space-y-8 pb-16 pt-10">
        <div className="flex justify-start sm:justify-end">
          <button
            onClick={() => setFindMyPhotosOpen(true)}
            className="gk-btn gk-btn-primary w-full sm:w-auto"
          >
            <ScanFace className="h-5 w-5" /> Find My Photos
          </button>
        </div>

        <div>
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
