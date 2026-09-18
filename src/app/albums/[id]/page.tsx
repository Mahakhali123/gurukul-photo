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
      
      {/* Album Hero Header — institutional navy band with saffron accents */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#16294d] via-[#1d3560] to-[#0f1e3a] py-12 text-white sm:py-16">

        {/* saffron / gold glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(500px 260px at 85% 10%, rgba(234,88,12,0.35), transparent 60%), radial-gradient(400px 240px at 5% 95%, rgba(201,162,39,0.22), transparent 60%)' }}
        />
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ea580c] via-[#c9a227] to-[#ea580c]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative space-y-6">
          
          {/* Breadcrumb */}
          <nav className="flex items-center space-x-2 text-[13px] text-white/60">
            <Link href="/" className="hover:text-white transition">Home</Link>
            <span>/</span>
            <Link href="/albums" className="hover:text-white transition">Albums</Link>
            <span>/</span>
            <span className="text-[#fdba74] font-semibold truncate max-w-xs" title={displayAlbumName}>{displayAlbumName}</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center text-[11px] uppercase font-bold tracking-[0.12em] px-3 py-1.5 rounded-full bg-[#ea580c] text-white shadow">
                  {album.category}
                </span>
                <span className="flex items-center text-[13px] text-white/70 font-medium">
                  <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#fcd34d]" />
                  {new Date(album.date || album.createdTime).toLocaleDateString('en-IN', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              <h1 className="!text-white text-[34px] sm:text-[46px] lg:text-[54px] font-extrabold leading-tight" title={displayAlbumName}>
                {displayAlbumName}
              </h1>

              <p className="text-[15px] sm:text-base text-white/70 leading-relaxed">
                {displayAlbumDesc}
              </p>
            </div>

            {/* Album Header Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleShare}
                className="inline-flex items-center space-x-2 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-[14px] font-semibold backdrop-blur-sm border border-white/20 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
                <span>{copied ? 'Album Link Copied!' : 'Share Album'}</span>
              </button>

              <Link
                href="/albums"
                className="inline-flex items-center space-x-2 px-5 py-3 rounded-full bg-white text-[#16294d] hover:bg-[#fff7ed] text-[14px] font-bold transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>All Albums</span>
              </Link>
            </div>

          </div>

          {/* Photo Count Pill */}
          <div className="pt-2 flex items-center space-x-2 text-[13px] text-white/70">
            <ImageIcon className="w-4 h-4 text-[#fdba74]" />
            <span className="font-semibold">
              {photos.filter((p) => p.mediaType !== 'audio').length} Photos & Videos • {photos.filter((p) => p.mediaType === 'audio').length} Audios • {photos.length} total
            </span>
          </div>

        </div>

      </div>

      {/* Subfolders inside this album (e.g., Dashavatar Assembly separator folders) */}
      {subAlbums.length > 0 && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest text-[#ea580c] border-b border-[#e6eaf1] pb-3">
            <FolderOpen className="w-4 h-4" />
            <span>Folders inside {displayAlbumName} ({subAlbums.length})</span>
          </div>
          <AlbumGrid albums={subAlbums} />
          <div className="text-[13px] text-[#64748b] pt-2 border-t border-[#f1f5f9]">
            Tap a folder to open its images and videos - each folder keeps its own photos/videos separately.
          </div>
        </div>
      )}

      {/* Photos Grid Container */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col gap-1 border-b border-[#e6eaf1] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-[22px] sm:text-[26px] font-extrabold text-[#16294d]">
            {subAlbums.length > 0 ? `All Media in ${displayAlbumName} (including subfolders)` : `Photos, Videos & Audios in ${displayAlbumName}`}
          </h2>
          <span className="text-[13px] text-[#64748b]">Click any photo to view, play video/audio, or download</span>
        </div>

        <PhotoGrid photos={photos} />
      </div>

    </div>
  );
}
