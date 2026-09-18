'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Calendar,
  Folder,
  Tag,
  Check,
  Video,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { DriveFile } from '@/types';

interface PhotoLightboxProps {
  photos: DriveFile[];
  currentIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

// Extensions Chrome/Safari/Firefox can play directly in <video>.
// mkv / avi / wmv / flv / mpg need Google's transcoding (Drive iframe).
const NATIVE_VIDEO_EXTS = ['mp4', 'm4v', 'webm', 'mov', '3gp', '3g2', 'ogv', 'ogg'];

function getFileExt(name?: string): string {
  if (!name || typeof name !== 'string') return '';
  const parts = name.split('.');
  if (parts.length < 2) return '';
  return (parts.pop() || '').toLowerCase();
}

function isNativelyPlayableVideo(name: string): boolean {
  return NATIVE_VIDEO_EXTS.includes(getFileExt(name));
}

// Drive reports .wav as audio/x-wav (or audio/wave) and .ogg/.oga vary by
// uploader — normalize to the canonical type browsers expect in <source>,
// falling back to the extension map when Drive gives a generic type.
function inferAudioMime(name?: string, mimeType?: string): string | undefined {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    wave: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wma: 'audio/x-ms-wma',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
  };
  const ext = getFileExt(name);
  if (ext && map[ext]) return map[ext];
  if (mimeType?.startsWith('audio/')) {
    if (mimeType === 'audio/x-wav' || mimeType === 'audio/wave') return 'audio/wav';
    return mimeType;
  }
  return mimeType || 'audio/mpeg';
}

// Drive sometimes reports video/* wrong (or generic octet-stream when
// scraped). <source type=""> from the real extension helps the browser
// pick a working source instead of stalling on the poster.
function inferVideoMime(name?: string, mimeType?: string): string | undefined {
  if (mimeType?.startsWith('video/')) return mimeType;
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    mov: 'video/quicktime',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    ogv: 'video/ogg',
    ogg: 'video/ogg',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
    mpg: 'video/mpeg',
    mpeg: 'video/mpeg',
  };
  return map[getFileExt(name)] || mimeType || 'video/mp4';
}

export function PhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
}: PhotoLightboxProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  // Video player mode: 'native' (<video> direct stream, custom UI) or
  // 'drive' (Google preview iframe, handles transcoding + large files).
  const [playerMode, setPlayerMode] = useState<'native' | 'drive'>('native');
  const [videoSlow, setVideoSlow] = useState(false);
  // Audio fallback: index into directAudioSources. <audio src> ignores
  // nested <source> fallbacks, so we cycle src on onError instead.
  const [audioSrcIndex, setAudioSrcIndex] = useState(0);
  const [audioFailed, setAudioFailed] = useState(false);
  const touchStartX = React.useRef<number | null>(null);

  // Defensive: photos may be undefined during loading / malformed cache.
  const safePhotos = Array.isArray(photos) ? photos : [];
  const activeMedia =
    currentIndex !== null && safePhotos[currentIndex] ? safePhotos[currentIndex] : null;

  // Derive media flags BEFORE any early return so hook order never changes.
  // Fall back to extension/mime sniffing when mediaType is missing (old cache).
  const activeExt = getFileExt(activeMedia?.name);
  const activeMime = activeMedia?.mimeType || '';
  const isVideo =
    activeMedia?.mediaType === 'video' ||
    (!activeMedia?.mediaType && activeMime.startsWith('video/'));
  const isAudio =
    activeMedia?.mediaType === 'audio' ||
    (!activeMedia?.mediaType &&
      (activeMime.startsWith('audio/') ||
        ['mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'wma', 'aiff', 'aif'].includes(activeExt)));
  const isImage = !!activeMedia && !isVideo && !isAudio;

  // WHY this order for <video> sources:
  // 1. uc?export=view serves bytes INLINE (plays in the page). The old
  //    export=download URLs serve Content-Disposition: attachment, which is
  //    why phones showed "download video" instead of playing it.
  // 2. usercontent download = same bytes, different host (works when uc is throttled).
  // 3. /api/download?mode=stream = our proxy with proper video Content-Type
  //    + Range support (last resort: Vercel serverless can time out on big files).
  // NOTE: per-<source> onError is unreliable (a 200 HTML virus-scan page
  // fires no error and the video stalls on the poster). So error handling
  // lives on <video onError> + a slow-start watchdog below — either flips
  // to the Drive iframe player, which transcodes any codec.
  const directVideoSources: string[] = isVideo && activeMedia
    ? [
        `https://drive.google.com/uc?export=view&id=${activeMedia.id}`,
        `https://drive.usercontent.google.com/download?id=${activeMedia.id}&export=download&confirm=t`,
        `/api/download?id=${activeMedia.id}&name=${encodeURIComponent(activeMedia.name || 'video')}&mode=stream`,
      ]
    : [];
  const videoMime = isVideo && activeMedia ? inferVideoMime(activeMedia.name, activeMedia.mimeType) : undefined;
  const previewUrl = activeMedia
    ? activeMedia.videoStreamUrl || `https://drive.google.com/file/d/${activeMedia.id}/preview`
    : '';
  // Audio streams straight from Google (Range-supported) with Vercel proxy as fallback.
  // <audio> needs a direct file URL — Drive preview iframe can't play mp3/wav inline.
  const directAudioSources: string[] = isAudio && activeMedia
    ? [
        activeMedia.audioStreamUrl || `https://drive.usercontent.google.com/download?id=${activeMedia.id}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=view&id=${activeMedia.id}`,
        `/api/download?id=${activeMedia.id}&name=${encodeURIComponent(activeMedia.name || 'audio')}&mode=stream`,
      ]
    : [];
  // Canonical audio type (wav/ogg/m4a…) so the browser accepts every source.
  const audioMime = isAudio && activeMedia ? inferAudioMime(activeMedia.name, activeMedia.mimeType) : undefined;

  useEffect(() => {
    setZoomLevel(1);
    setMediaLoaded(false);
    setVideoSlow(false);
    setAudioSrcIndex(0);
    setAudioFailed(false);
    // Codecs browsers can't play natively (mkv/avi/wmv/flv) start directly
    // in the Drive player — <video> would just sit on the poster forever.
    if (activeMedia?.mediaType === 'video' || activeMime.startsWith('video/')) {
      const nm = activeMedia?.name || '';
      setPlayerMode(isNativelyPlayableVideo(nm) ? 'native' : 'drive');
    } else {
      setPlayerMode('native');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Lock body scroll while lightbox is open (prevents background scroll on mobile)
  useEffect(() => {
    if (currentIndex === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [currentIndex]);

  const handlePrev = useCallback(() => {
    if (currentIndex === null || safePhotos.length === 0) return;
    const nextIndex = currentIndex === 0 ? safePhotos.length - 1 : currentIndex - 1;
    onNavigate(nextIndex);
  }, [currentIndex, safePhotos.length, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex === null || safePhotos.length === 0) return;
    const nextIndex = currentIndex === safePhotos.length - 1 ? 0 : currentIndex + 1;
    onNavigate(nextIndex);
  }, [currentIndex, safePhotos.length, onNavigate]);

  useEffect(() => {
    if (currentIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel((z) => Math.min(z + 0.25, 3));
      } else if (e.key === '-') {
        setZoomLevel((z) => Math.max(z - 0.25, 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, handlePrev, handleNext, onClose]);

  // Slow-start watchdog: Google sometimes answers a <video> request with a
  // 200 HTML page (virus-scan interstitial / throttling). No error fires and
  // the player sits on the poster. If no video data arrives in 12s, show a
  // one-tap switch to the Drive player. MUST live before the early return
  // below — hooks after a conditional return change hook order and crash
  // with "Rendered more hooks than during the previous render", which
  // surfaces as "Application error: a client-side exception has occurred".
  const mediaIdForWatchdog = activeMedia?.id;
  useEffect(() => {
    if (currentIndex === null || !isVideo || playerMode !== 'native') return;
    setVideoSlow(false);
    const timer = setTimeout(() => setVideoSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [mediaIdForWatchdog, isVideo, playerMode, currentIndex]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch((err) => console.error(err));
      setIsFullscreen(false);
    }
  };

  // Direct download handler
  const handleDownload = () => {
    if (!activeMedia) return;
    const safeName = activeMedia.name || `audio_${activeMedia.id}`;
    const downloadUrl = `/api/download?id=${activeMedia.id}&name=${encodeURIComponent(safeName)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (!activeMedia) return;
    const mt = activeMedia.mediaType || (isAudio ? 'audio' : isVideo ? 'video' : 'image');
    const mediaLabel = mt === 'video' ? 'video' : mt === 'audio' ? 'audio' : 'photo';
    const shareData = {
      title: `${activeMedia.name || 'Media'} - Swaminarayan Gurukul`,
      text: activeMedia.description || `Listen to ${mediaLabel} from ${activeMedia.albumName || 'Gurukul'} at Swaminarayan Gurukul.`,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    if (typeof window !== 'undefined') {
      try {
        navigator.clipboard?.writeText(window.location.href);
      } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Audio source fallback: <audio src> ignores nested <source> children,
  // so advance through directAudioSources on each error. When all fail,
  // show Download / Open-in-Drive instead of a dead player.
  const handleAudioError = () => {
    if (audioSrcIndex < directAudioSources.length - 1) {
      setAudioSrcIndex((i) => i + 1);
    } else {
      setAudioFailed(true);
    }
  };

  const formatMediaDate = (value?: string): string => {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };

  if (currentIndex === null || !activeMedia) return null;

  // Swipe navigation for touch devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) handleNext();
    else handlePrev();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white backdrop-blur-md select-none animate-fade-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-black/60 border-b border-white/10 z-20" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center space-x-2 sm:space-x-3 truncate min-w-0 flex-1">
          <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-orange-600/80 text-orange-100 border border-orange-500/40 flex items-center space-x-1">
            {isVideo ? <Video className="w-3 h-3" /> : isAudio ? <Music className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
            <span>{currentIndex + 1} / {safePhotos.length}</span>
          </span>
          <h2 className="text-sm font-medium text-slate-200 truncate min-w-0">
            {activeMedia.name || 'Untitled'}
          </h2>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          
          {/* Zoom controls (For images only — hidden for video & audio) */}
          {isImage && (
            <>
              <button
                onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 1))}
                disabled={zoomLevel <= 1}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 transition"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                disabled={zoomLevel >= 3}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 transition"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Prominent Download button */}
          <button
            onClick={handleDownload}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md transition"
            title={`Download ${isVideo ? 'Video' : isAudio ? 'Audio' : 'High-Res Photo'}`}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Share button */}
          <button
            onClick={handleShare}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition relative"
            title="Share"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            {copied && (
              <span className="absolute -bottom-8 right-0 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded shadow whitespace-nowrap">
                Link copied!
              </span>
            )}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition hidden sm:inline-flex"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-500/20 hover:text-red-300 transition ml-2"
            title="Close Lightbox (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Media Stage */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-6">
        
        {/* Previous Navigation Arrow */}
        <button
          onClick={handlePrev}
          className="absolute left-1.5 sm:left-6 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-4 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-sm transition-all transform hover:scale-110 border border-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Previous Media"
        >
          <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
        </button>

        {/* Next Navigation Arrow */}
        <button
          onClick={handleNext}
          className="absolute right-1.5 sm:right-6 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-4 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-sm transition-all transform hover:scale-110 border border-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Next Media"
        >
          <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
        </button>

        {/* Center Display: Video Player, Audio Player, or Image */}
        {isVideo ? (
          <div className="relative w-full max-w-4xl max-h-[62vh] sm:max-h-[80vh] aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
            {playerMode === 'native' ? (
              <div className="w-full h-full flex flex-col">
                <video
                  key={activeMedia.id}
                  className="w-full h-full flex-1 bg-black"
                  controls
                  playsInline
                  preload="metadata"
                  poster={activeMedia.thumbnailLink || undefined}
                  // Reliable failure signal: per-<source> onError misses the
                  // common case (Google 200 HTML interstitial), <video>
                  // onError + the watchdog above catch it and offer the
                  // Drive player instead of a stuck poster frame.
                  onError={() => setPlayerMode('drive')}
                  onLoadedData={() => setVideoSlow(false)}
                  onPlaying={() => setVideoSlow(false)}
                >
                  {directVideoSources.map((src, i) => (
                    <source
                      key={`${activeMedia.id}-${i}`}
                      src={src}
                      type={videoMime}
                    />
                  ))}
                  Your browser does not support video playback.
                </video>
                <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-1.5 bg-black/70 text-[11px]">
                  {videoSlow ? (
                    <span className="text-amber-300 font-medium">
                      Taking too long?{' '}
                      <button onClick={() => setPlayerMode('drive')} className="underline font-bold hover:text-amber-200">
                        Switch to alternate player
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setPlayerMode('drive')} className="text-slate-300 hover:text-white underline">
                      Video not playing? Try alternate player
                    </button>
                  )}
                  <a
                    href={`https://drive.google.com/file/d/${activeMedia.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 hover:text-white underline"
                  >
                    Open original file
                  </a>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col">
                <iframe
                  key={activeMedia.id}
                  src={previewUrl}
                  className="w-full h-full flex-1 rounded-xl sm:rounded-2xl"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title={activeMedia.name}
                />
                <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-1.5 bg-black/70 text-[11px]">
                  <button onClick={() => setPlayerMode('native')} className="text-slate-300 hover:text-white underline">
                    Try direct play instead
                  </button>
                  <a
                    href={`https://drive.google.com/file/d/${activeMedia.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 hover:text-white underline"
                  >
                    Video still not playing? Open original file
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : isAudio ? (
          /* Audio player — Drive has no preview player for mp3/wav, so stream
             direct file bytes in a native <audio> element with src fallback. */
          <div className="relative w-full max-w-xl bg-[#111] rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-6 sm:p-8 flex flex-col items-center text-center">
            <span className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-[#CC0000] flex items-center justify-center shadow-lg">
              <Music className="w-10 h-10 text-white" />
            </span>
            <h3 className="mt-4 text-base sm:text-lg font-bold text-white truncate max-w-full" title={activeMedia.name || 'Audio'}>
              {(activeMedia.name || 'Audio').replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}
            </h3>
            <p className="text-xs text-slate-400 mt-1 truncate max-w-full">
              {activeMedia.albumName || 'Gurukul'} • {((activeMedia.name || '').split('.').pop() || 'audio').toUpperCase()}
            </p>
            {!audioFailed && directAudioSources.length > 0 ? (
              <audio
                key={`${activeMedia.id}-${audioSrcIndex}`}
                className="mt-5 w-full"
                controls
                autoPlay
                preload="metadata"
                src={directAudioSources[Math.min(audioSrcIndex, directAudioSources.length - 1)]}
                onError={handleAudioError}
              >
                Your browser does not support audio playback.
              </audio>
            ) : audioFailed ? (
              <p className="mt-5 w-full text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
                This browser blocked direct playback of this {(activeExt || 'audio').toUpperCase()} file.
                Please use Download or open the original file below — the file itself is fine.
              </p>
            ) : null}
            {isAudio && !audioFailed && audioSrcIndex > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Trying alternate source ({audioSrcIndex + 1}/{directAudioSources.length})…
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
              <button
                onClick={handleDownload}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Audio</span>
              </button>
              <a
                href={`https://drive.google.com/file/d/${activeMedia.id}/view`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-300 hover:text-white underline"
              >
                Open original file
              </a>
            </div>
          </div>
        ) : (
          <div
            className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-200 ease-out"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            {!mediaLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeMedia.highResUrl || activeMedia.directUrl || activeMedia.thumbnailLink || ''}
              alt={activeMedia.name || 'Photo'}
              onLoad={() => setMediaLoaded(true)}
              onError={() => setMediaLoaded(true)}
              className={`max-h-[82vh] max-w-[92vw] object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${
                mediaLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        )}

      </div>

      {/* Bottom Info Bar */}
      {showDetails && (
        <div className="bg-black/70 border-t border-white/10 px-4 sm:px-8 py-3 z-20 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center text-amber-400 font-semibold">
                <Folder className="w-3.5 h-3.5 mr-1" />
                {activeMedia.albumName || 'Gurukul'}
              </span>
              {formatMediaDate(activeMedia.createdTime) && (
                <span className="flex items-center text-slate-400">
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  {formatMediaDate(activeMedia.createdTime)}
                </span>
              )}
              {activeMedia.category && (
                <span className="flex items-center capitalize px-2 py-0.5 rounded bg-white/10 text-slate-200">
                  <Tag className="w-3 h-3 mr-1 text-orange-400" />
                  {activeMedia.category}
                </span>
              )}
            </div>

            {/* In-viewer direct download action button */}
            <button
              onClick={handleDownload}
              className="inline-flex items-center space-x-1.5 text-xs text-orange-400 hover:text-orange-300 font-semibold underline"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download file directly ({activeMedia.mediaType || (isAudio ? 'audio' : isVideo ? 'video' : 'image')})</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
