'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Folder, Image as ImageIcon, ArrowRight, Calendar, Music, Video } from 'lucide-react';
import { DriveFile, Album } from '@/types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<DriveFile[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open
          setQuery('');
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || query.trim().length === 0) {
      setPhotos([]);
      setAlbums([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [photosRes, albumsRes] = await Promise.all([
          fetch(`/api/photos?search=${encodeURIComponent(query)}&limit=8`),
          fetch(`/api/albums`),
        ]);
        const photosData = await photosRes.json();
        const albumsData = await albumsRes.json();

        if (photosData.success) {
          setPhotos(photosData.data || []);
        }
        if (albumsData.success) {
          const q = query.toLowerCase();
          const matchedAlbums = (albumsData.data as Album[]).filter(
            (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
          );
          setAlbums(matchedAlbums.slice(0, 4));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      
      {/* Modal Dialog */}
      <div className="w-full max-w-2xl bg-white rounded-[22px] shadow-2xl border border-[#d9d9dd] overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Top Search Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#d9d9dd]">
          <Search className="w-5 h-5 text-[#17171c] mr-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search photos, audios, students, annual day, sports, albums..."
            autoFocus
            className="w-full text-slate-800 placeholder:text-slate-400 focus:outline-none text-base font-medium"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          
          {loading && (
            <div className="py-8 text-center text-xs text-slate-400">
              Searching gallery...
            </div>
          )}

          {!loading && query.trim() === '' && (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">Quick Search across Gurukul</p>
              <p className="text-xs text-slate-400 mt-1">
                Type keywords like &quot;Annual Day&quot;, &quot;Sports&quot;, &quot;Science&quot;, or &quot;Yoga&quot;
              </p>
            </div>
          )}

          {!loading && query.trim() !== '' && photos.length === 0 && albums.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-600">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-slate-400 mt-1">Try another keyword</p>
            </div>
          )}

          {/* Matched Albums */}
          {albums.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Albums ({albums.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {albums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => {
                      onClose();
                      router.push(`/albums/${album.id}`);
                    }}
                    className="flex items-center space-x-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-orange-50/60 hover:border-orange-200 cursor-pointer transition"
                  >
                    <div className="w-10 h-10 rounded-lg bg-orange-100 text-gurukul-saffron-600 flex items-center justify-center shrink-0">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{album.name}</p>
                      <p className="text-[11px] text-slate-400">{album.photoCount + (album.videoCount || 0) + (album.audioCount || 0)} items</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Photos */}
          {photos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Photos, Videos & Audios ({photos.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => {
                      onClose();
                      router.push(`/photos?search=${encodeURIComponent(photo.name)}`);
                    }}
                    className="group cursor-pointer rounded-xl overflow-hidden border border-slate-100 bg-slate-50 hover:border-orange-300 transition"
                  >
                    <div className="aspect-[4/3] bg-slate-200 relative overflow-hidden flex items-center justify-center">
                      {photo.mediaType === 'audio' ? (
                        <span className="w-10 h-10 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center">
                          <Music className="w-5 h-5" />
                        </span>
                      ) : photo.mediaType === 'video' ? (
                        <span className="absolute bottom-1 right-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-black text-white flex items-center gap-1">
                          <Video className="w-3 h-3" /> Video
                        </span>
                      ) : null}
                      {photo.mediaType !== 'audio' && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo.thumbnailLink || photo.directUrl}
                        alt={photo.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition absolute inset-0"
                      />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] font-medium text-slate-800 truncate">
                        {photo.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{photo.albumName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Search photos</span>
          <button
            onClick={() => {
              onClose();
              router.push(`/photos?search=${encodeURIComponent(query)}`);
            }}
            className="inline-flex items-center space-x-1 text-gurukul-saffron-600 font-semibold hover:underline"
          >
            <span>View all in Gallery</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

    </div>
  );
}
