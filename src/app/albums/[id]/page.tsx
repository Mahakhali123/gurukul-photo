'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  FolderOpen,
  Image as ImageIcon,
  Share2,
  Check,
  Download,
  Sparkles,
} from 'lucide-react';
import { Album, DriveFile } from '@/types';
import { PhotoGrid } from '@/components/gallery/PhotoGrid';
import { AlbumGrid } from '@/components/albums/AlbumGrid';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/EmptyState';
import { formatEventDate } from '@/lib/formatDate';

export default function SingleAlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<DriveFile[]>([]);
  const [subAlbums, setSubAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadAlbumData = async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch(`/api/albums/${albumId}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Album server responded ${res.status}. Please tap Retry.`);
      const data = await res.json();
      if (data.success && data.data) {
        setAlbum(data.data.album);
        setPhotos(data.data.photos || []);
        setSubAlbums(data.data.subAlbums || []);
      } else {
        throw new Error(data.error || 'Album not found');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Taking longer than expected — the server is still warming up. Please tap Retry.');
      } else {
        setError(err.message || 'Failed to load album');
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (albumId) {
      loadAlbumData();
    }
  }, [albumId]);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading) {
    return <LoadingSpinner label="Loading album photos..." />;
  }

  if (error || !album) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <ErrorMessage
          message={error || 'Album not found.'}
          onRetry={loadAlbumData}
        />
        <div className="text-center mt-4">
          <Link
            href="/albums"
            className="inline-flex items-center space-x-2 text-sm text-gurukul-saffron-600 font-semibold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to All Albums</span>
          </Link>
        </div>
      </div>
    );
  }

  const GTL_ID = '17aUq0tbmExJFFmNFR61SyBqbzcWElv-6';
  const isGTLAlbum = album.id === GTL_ID || album.folderId === GTL_ID || album.name.toLowerCase().includes('gtl');
  const displayAlbumName = isGTLAlbum ? 'GTL' : album.name;
  const displayAlbumDesc = isGTLAlbum ? 'Grand Talent League • Swaminarayan Gurukul — Live performance and talent showcase.' : album.description;

  return (
    <div className="space-y-10 pb-16">
      
      {/* Album page head */}
      <div className="border-b border-[#dddddd] bg-[#eff2f6]">
        <div className="gk-container space-y-5 py-12 lg:pt-[90px]">

          {/* Breadcrumb */}
          <nav className="flex items-center space-x-2 text-[15px] text-[#6c757d]">
            <Link href="/" className="hover:text-[#cc0000]">Home</Link>
            <span>/</span>
            <Link href="/albums" className="hover:text-[#cc0000]">Albums</Link>
            <span>/</span>
            <span className="max-w-xs truncate text-[#cc0000]" title={displayAlbumName}>{displayAlbumName}</span>
          </nav>

          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center bg-[#cc0000] px-3 py-1 text-[13px] uppercase tracking-[0.1em] text-white">
                  {album.category}
                </span>
                <span className="flex items-center text-[15px] text-[#6c757d]">
                  <Calendar className="mr-1.5 h-4 w-4 text-[#cc0000]" />
                  {formatEventDate(album.date || album.createdTime)}
                </span>
              </div>

              <h1 className="h1-common" title={displayAlbumName}>
                {displayAlbumName}
              </h1>

              <p className="text-[17px] leading-[1.75]">
                {displayAlbumDesc}
              </p>
            </div>

            {/* Album Header Actions */}
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={handleShare} className="gk-btn gk-btn-outline">
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                <span>{copied ? 'Album Link Copied!' : 'Share Album'}</span>
              </button>

              <Link href="/albums" className="gk-btn gk-btn-dark">
                <ArrowLeft className="h-4 w-4" />
                <span>All Albums</span>
              </Link>
            </div>

          </div>

          {/* Media counts */}
          <div className="flex items-center space-x-2 pt-1 text-[15px] text-[#6c757d]">
            <ImageIcon className="h-4 w-4 text-[#cc0000]" />
            <span>
              {photos.filter((p) => p.mediaType !== 'audio').length} Photos &amp; Videos • {photos.filter((p) => p.mediaType === 'audio').length} Audios • {photos.length} total
            </span>
          </div>

        </div>

      </div>

      {/* Subfolders inside this album (e.g., Dashavatar Assembly separator folders) */}
      {subAlbums.length > 0 && (
        <div className="gk-container space-y-4">
          <div className="flex items-center gap-2 border-b border-[#dddddd] pb-3 text-[15px] uppercase tracking-[0.12em] text-[#cc0000]">
            <FolderOpen className="h-4 w-4" />
            <span>Folders inside {displayAlbumName} ({subAlbums.length})</span>
          </div>
          <AlbumGrid albums={subAlbums} />
          <div className="border-t border-[#dddddd] pt-2 text-[15px] text-[#6c757d]">
            Tap a folder to open its images and videos - each folder keeps its own photos/videos separately.
          </div>
        </div>
      )}

      {/* Photos Grid Container */}
      <div className="gk-container space-y-6">
        <div className="flex flex-col gap-1 border-b border-[#dddddd] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="h3-common">
            {subAlbums.length > 0 ? `All Media in ${displayAlbumName} (including subfolders)` : `Photos, Videos & Audios in ${displayAlbumName}`}
          </h2>
          <span className="text-[15px] text-[#6c757d]">Click any photo to view, play video/audio, or download</span>
        </div>

        <PhotoGrid photos={photos} />
      </div>

    </div>
  );
}
