'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Upload, ScanFace, Loader2, RotateCcw, ShieldCheck, ImagePlus, Camera,
  Download, Check, Users, FileArchive, ChevronRight,
} from 'lucide-react';
import type { DriveFile } from '@/types';
import { PhotoLightbox } from './PhotoLightbox';
import {
  ensureFaceModels,
  descriptorForSelfie,
  findMatchingPhotos,
  clearFaceCache,
  requeryIndex,
  rethresholdMatches,
  indexCoverage,
  clusterIndex,
  refAgreement,
  MATCH_DEFAULT,
  MATCH_MIN,
  MATCH_MAX,
  FILTER_MIN,
  averageDescriptors,
  type FaceMatch,
  type PersonGroup,
} from '@/lib/faceSearch';
import { reportTimings, startTiming } from '@/lib/faceTimings';

interface FindMyPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: DriveFile[];
}

type Stage = 'upload' | 'analyzing-selfie' | 'ready' | 'scanning' | 'done';

// NOMIN parity: several angles beat one. 5 covers front/left/right/glasses/older-photo.
const MAX_SELFIES = 5;

/**
 * Preview sources for a result tile, in order of preference.
 *
 * Google's CDN leads here because a result grid holds hundreds of tiles and it
 * serves them in parallel. Routing every tile through our own proxy instead
 * just moves the queue onto our server, which has to make each Google request
 * itself — measurably slower for a grid this size. (The scan's cached copies
 * are no help: those were CORS requests, which the browser caches under a
 * different key than a plain <img>.)
 *
 * The proxy is the first fallback, which is the part that was missing: the tile
 * previously had a single source and no onError, so one throttled response from
 * Google left it blank forever.
 */
function thumbSources(photo: DriveFile): string[] {
  return [
    photo.thumbnailLink || '',
    `/api/thumb?id=${photo.id}&sz=w400`,
    `https://drive.google.com/thumbnail?id=${photo.id}&sz=w800`,
    `https://lh3.googleusercontent.com/d/${photo.id}=w800`,
  ].filter(Boolean);
}

/** Result thumbnail that walks the source list instead of going blank on the
 *  first failure, which is what left tiles permanently empty before. */
function ResultThumb({
  photo,
  className,
  alt,
}: {
  photo: DriveFile;
  className: string;
  alt?: string;
}) {
  const sources = useMemo(() => thumbSources(photo), [photo]);
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-[#eeece7] text-[#93939f]`}
        aria-label={alt}
      >
        <ImagePlus className="h-5 w-5" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={sources[step]}
      alt={alt ?? photo.name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (step + 1 < sources.length) setStep(step + 1);
        else setFailed(true);
      }}
      className={className}
    />
  );
}

function confidence(distance: number): string {
  return `${Math.max(0, Math.round((1 - distance) * 100))}%`;
}

/** "about 2m 10s left" — rounded, never false-precise. */
function formatEta(secondsLeft: number): string {
  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return 'almost done';
  if (secondsLeft < 10) return 'a few seconds left';
  if (secondsLeft < 60) return `about ${Math.round(secondsLeft / 5) * 5}s left`;
  // Round the whole duration first — rounding the seconds part on its own
  // yields "4m 60s" whenever the remainder lands above 55.
  const rounded = Math.round(secondsLeft / 10) * 10;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return s > 0 ? `about ${m}m ${s}s left` : `about ${m}m left`;
}

export function FindMyPhotosModal({ isOpen, onClose, photos }: FindMyPhotosModalProps) {
  const [stage, setStage] = useState<Stage>('upload');
  const [modelStatus, setModelStatus] = useState('Preparing face search…');
  const [modelsReady, setModelsReady] = useState(false);
  const [selfies, setSelfies] = useState<{ descriptor: Float32Array; previewUrl: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ---- NOMIN: 2 WHERE — strictness + index ----
  const [searchThreshold, setSearchThreshold] = useState(MATCH_DEFAULT);
  const [filterThreshold, setFilterThreshold] = useState(MATCH_DEFAULT);
  const [coverage, setCoverage] = useState<{ indexed: number; total: number } | null>(null);
  const [requeryNote, setRequeryNote] = useState<string | null>(null);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [scanMode, setScanMode] = useState<'full' | 'index' | 'fast' | null>(null);
  const [etaLabel, setEtaLabel] = useState<string | null>(null);

  // ---- Fast server path (precomputed index, <3s) ----
  const [consent, setConsent] = useState(false);
  const [fastLoading, setFastLoading] = useState(false);
  const [fastError, setFastError] = useState<string | null>(null);
  const [fastMs, setFastMs] = useState<number | null>(null);
  const [fastProvider, setFastProvider] = useState<string | null>(null);
  const [fastNote, setFastNote] = useState<string | null>(null);
  const [serverFaces, setServerFaces] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(48);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());
  const selfieDataUrlRef = useRef<string | null>(null);
  const fastCacheRef = useRef(new Map<string, { at: number; results: FaceMatch[]; ms: number }>());

  // Matches arrive faster than React should re-render. They are buffered here
  // and flushed on a timer — appending + re-sorting the whole list on every
  // single hit made the grid stutter badly once a scan passed a few hundred.
  const pendingMatchesRef = useRef<FaceMatch[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanStartRef = useRef(0);
  const [matches, setMatches] = useState<FaceMatch[]>([]);
  const [cacheCleared, setCacheCleared] = useState(false);

  // ---- NOMIN: 3 PICK — tick / filter / preview ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // ---- NOMIN: 4 EXPORT ----
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  // ---- NOMIN: Everyone found ----
  const [showPeople, setShowPeople] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleGroups, setPeopleGroups] = useState<PersonGroup[]>([]);
  const [peopleView, setPeopleView] = useState<PersonGroup | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const imageCount = useMemo(
    () => photos.filter((p) => (p.mediaType ?? 'image') === 'image').length,
    [photos]
  );

  // NOMIN enrol guard: warn when the reference selfies disagree.
  const agreement = useMemo(
    () => refAgreement(selfies.map((s) => s.descriptor)),
    [selfies]
  );

  // NOMIN rethreshold: filter slider tightens instantly, no rescan.
  const filtered = useMemo(
    () => rethresholdMatches(matches, filterThreshold),
    [matches, filterThreshold]
  );

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const m of filtered) if (selectedIds.has(m.photo.id)) n += 1;
    return n;
  }, [filtered, selectedIds]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (cameraOn && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Live camera is not available in this browser — upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError('Camera is blocked — allow camera access in the browser address bar, or upload a photo instead.');
    }
  }, []);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('Camera is not ready yet — wait a second and tap capture again.');
      return;
    }
    const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Capture failed — upload a photo instead.');
      return;
    }
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        stopCamera();
        if (blob) {
          handleFile(new File([blob], 'live-selfie.jpg', { type: 'image/jpeg' }));
        } else {
          setError('Capture failed — upload a photo instead.');
        }
      },
      'image/jpeg',
      0.92
    );
  }

  // Preload models + probe the local face index the moment the modal opens.
  useEffect(() => {
    mountedRef.current = true;
    if (isOpen) {
      setError(null);
      setRequeryNote(null);
      ensureFaceModels((msg) => {
        if (mountedRef.current) setModelStatus(msg);
      })
        .then(() => {
          if (mountedRef.current) {
            setModelsReady(true);
            setModelStatus('Ready');
          }
        })
        .catch(() => {
          if (mountedRef.current) setError('Could not load face models — check your connection and reopen.');
        });
      indexCoverage(photos)
        .then((c) => {
          if (mountedRef.current) setCoverage(c);
        })
        .catch(() => {});
    }
    return () => {
      mountedRef.current = false;
    };
    // Re-probed when the gallery finishes loading too: opening the modal while
    // /api/photos is still in flight otherwise leaves it reading "0 of 0".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, photos.length]);

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      abortRef.current = null;
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingMatchesRef.current = [];
      stopCamera();
    }
  }, [isOpen, stopCamera]);

  // Guard against the modal unmounting mid-scan leaving the flush timer alive.
  useEffect(
    () => () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    },
    []
  );

  const resetSelfie = useCallback(() => {
    setSelfies((prev) => {
      prev.forEach((s) => {
        if (s.previewUrl.startsWith('blob:')) URL.revokeObjectURL(s.previewUrl);
      });
      return [];
    });
    setMatches([]);
    setVerifiedIds(new Set());
    setSelectedIds(new Set());
    setProgress({ done: 0, total: 0 });
    setError(null);
    setRequeryNote(null);
    setPeopleView(null);
    setStage('upload');
  }, []);

  const removeSelfie = useCallback((index: number) => {
    setSelfies((prev) => {
      const target = prev[index];
      if (target?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setStage('upload');
      return next;
    });
    setMatches([]);
    setSelectedIds(new Set());
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setError('Please choose an image file (JPG or PNG).');
        return;
      }
      if (selfies.length >= MAX_SELFIES) {
        setError(`Maximum ${MAX_SELFIES} selfies — remove one to add another.`);
        return;
      }
      setError(null);
      setStage('analyzing-selfie');
      try {
        // Stash a 640px copy for the fast server path (parallel, never blocks browser path).
        selfieToDataUrl640(file)
          .then((d) => { selfieDataUrlRef.current = d; })
          .catch(() => {});
        await ensureFaceModels();
        const { descriptor, previewUrl } = await descriptorForSelfie(file);
        if (!mountedRef.current) {
          URL.revokeObjectURL(previewUrl);
          return;
        }
        setSelfies((prev) => [...prev, { descriptor, previewUrl }].slice(0, MAX_SELFIES));
        setMatches([]);
        setSelectedIds(new Set());
        setProgress({ done: 0, total: 0 });
        setStage('ready');
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err?.message || 'Could not read that photo. Try another one.');
          setStage(selfies.length > 0 ? 'ready' : 'upload');
        }
      }
    },
    [selfies.length]
  );

  function applyResults(results: FaceMatch[], note?: string | null) {
    setMatches(results);
    setVisibleCount(48);
    setSelectedIds(new Set(results.map((m) => m.photo.id)));
    setFilterThreshold(searchThreshold);
    setRequeryNote(note ?? null);
    setStage('done');
    indexCoverage(photos)
      .then((c) => {
        if (mountedRef.current) setCoverage(c);
      })
      .catch(() => {});
  }

  // Full disk-style scan: reads every photo once, writes vectors to the index.
  const startScan = useCallback(async () => {
    if (selfies.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMatches([]);
    setSelectedIds(new Set());
    setProgress({ done: 0, total: imageCount });
    setError(null);
    setRequeryNote(null);
    setScanMode('full');
    setStage('scanning');
    setEtaLabel(null);
    scanStartRef.current = Date.now();
    pendingMatchesRef.current = [];

    const flushMatches = () => {
      const buffered = pendingMatchesRef.current;
      if (buffered.length === 0 || !mountedRef.current) return;
      pendingMatchesRef.current = [];
      setMatches((prev) => [...prev, ...buffered].sort((a, b) => a.distance - b.distance));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const m of buffered) next.add(m.photo.id);
        return next;
      });
    };
    flushTimerRef.current = setInterval(flushMatches, 400);

    try {
      const results = await findMatchingPhotos({
        references: selfies.map((s) => s.descriptor),
        photos,
        threshold: searchThreshold,
        signal: controller.signal,
        onProgress: (done, total) => {
          if (!mountedRef.current) return;
          setProgress({ done, total });
          // Rate is measured over the whole scan so far, which smooths out the
          // slow start while models warm and the prefetch queue fills.
          const elapsed = (Date.now() - scanStartRef.current) / 1000;
          if (done >= 25 && elapsed > 2) {
            setEtaLabel(formatEta(((total - done) * elapsed) / done));
          }
        },
        onMatch: (m) => {
          pendingMatchesRef.current.push(m);
        },
      });
      // `results` is the complete, authoritative list, so drop anything still
      // buffered — otherwise the flush in `finally` would append duplicates.
      pendingMatchesRef.current = [];
      if (mountedRef.current) applyResults(results);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (mountedRef.current) {
          flushMatches();
          setStage('done');
          // A stopped scan still wrote everything it got through to the index,
          // so refresh coverage — otherwise it looks like the work was thrown
          // away and the user re-runs it from scratch.
          indexCoverage(photos)
            .then((c) => {
              if (!mountedRef.current) return;
              setCoverage(c);
              setRequeryNote(
                `Stopped — the ${c.indexed.toLocaleString('en-IN')} photos read so far are saved to the index, so continuing later resumes from here.`
              );
            })
            .catch(() => {});
        }
      } else if (mountedRef.current) {
        setError('Scan stopped unexpectedly. Please try again.');
        setStage('ready');
      }
    } finally {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushMatches();
      if (abortRef.current === controller) abortRef.current = null;
      if (mountedRef.current) {
        setScanMode(null);
        setEtaLabel(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfies, photos, imageCount, searchThreshold]);

  // NOMIN "Re-search index": re-score stored vectors, ~1s, no downloads.
  const requery = useCallback(async () => {
    if (selfies.length === 0) return;
    abortRef.current?.abort();
    setError(null);
    setRequeryNote(null);
    setScanMode('index');
    setStage('scanning');
    setProgress({ done: 0, total: imageCount });
    try {
      const out = await requeryIndex({
        references: selfies.map((s) => s.descriptor),
        photos,
        threshold: searchThreshold,
        onProgress: (done, total) => {
          if (mountedRef.current) setProgress({ done, total });
        },
      });
      if (!mountedRef.current) return;
      const note =
        out.unindexed > 0
          ? `Searched ${out.indexed.toLocaleString('en-IN')} indexed photos instantly · ${out.unindexed.toLocaleString('en-IN')} not indexed yet — Start search for complete results.`
          : `Searched ${out.indexed.toLocaleString('en-IN')} stored faces in about a second — no photos re-downloaded.`;
      applyResults(out.matches, note);
    } catch {
      if (mountedRef.current) {
        setError('Index search failed. Try a full scan instead.');
        setStage('ready');
      }
    } finally {
      if (mountedRef.current) setScanMode(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfies, photos, imageCount, searchThreshold]);

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ---- Fast server helpers (additive; browser scan untouched below) ----

  /** Downscale selfie to ~640px JPEG before upload (cuts bytes ~70%). */
  const selfieToDataUrl640 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const t = startTiming('selfie-resize-640');
          const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas not supported');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          t.end({ w: canvas.width, h: canvas.height, bytes: dataUrl.length });
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read selfie'));
      };
      img.src = url;
    });
  }, []);

  /** Shared server vector index status (faces count drives fast-path CTA). */
  const [contribState, setContribState] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());

  const refreshServerStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/face-index');
      const j = await r.json();
      if (!mountedRef.current) return;
      if (typeof j?.memory?.faces === 'number') setServerFaces(j.memory.faces);
    } catch {
      // status is best-effort
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refreshServerStatus();
  }, [isOpen, refreshServerStatus]);

  /**
   * Contribute this device's already-computed vectors to the shared index.
   * No photos re-read, no re-detection — uploads what the browser scan
   * already stored, in small chunks. Makes fast search better for everyone.
   */
  const contributeIndex = useCallback(async () => {
    setContribState('Uploading…');
    try {
      const { getAllCachedDescriptors } = await import('@/lib/faceSearch');
      const rows = await getAllCachedDescriptors(photos);
      if (rows.length === 0) {
        setContribState('Nothing saved on this device yet — run Start search first, then share.');
        return;
      }
      let sent = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const r = await fetch('/api/face-index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(j.error || 'Upload failed.');
        sent += chunk.length;
        if (mountedRef.current) setContribState(`Uploading… ${sent}/${rows.length} photos`);
      }
      if (mountedRef.current) setContribState(`Shared ${sent} photos — ⚡ Fast search is now better for everyone.`);
      void refreshServerStatus();
    } catch (err: unknown) {
      if (mountedRef.current) setContribState(err instanceof Error ? err.message : 'Share failed.');
    }
  }, [photos, refreshServerStatus]);

  /**
   * ⚡ Fast search: the browser already computed the selfie descriptor —
   * only those 128 numbers go to the server (no photo upload). The server
   * searches the shared vector index in milliseconds and asks NVIDIA's AI
   * to double-check the top few (same slider scale throughout).
   */
  const fastSearch = useCallback(
    async () => {
      if (selfies.length === 0) return;
      if (!consent) {
        setFastError('Please tick the consent box first — required because students may be minors.');
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFastError(null);
      setFastNote(null);
      setFastLoading(true);
      setScanMode('fast');
      setStage('scanning');
      setMatches([]);
      setVerifiedIds(new Set());
      setProgress({ done: 0, total: imageCount });
      const tTotal = startTiming('fast-search-total');
      try {
        const avg = averageDescriptors(selfies.map((s) => s.descriptor));
        if (!avg) throw new Error('Could not use that selfie — re-upload it and try again.');
        const cacheKey = `${selfies.length}:${Array.from(avg.slice(0, 8)).map((v) => v.toFixed(3)).join(',')}:${searchThreshold.toFixed(2)}`;
        const cached = fastCacheRef.current.get(cacheKey);
        if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
          applyResults(cached.results, `Instant — same selfie from a few minutes ago (${cached.ms}ms).`);
          setFastMs(cached.ms);
          return;
        }
        const res = await fetch('/api/face-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descriptor: Array.from(avg),
            consent: true,
            threshold: searchThreshold,
            topK: 200,
            // AI double-check only; the match itself needs just the numbers.
            selfieDataUrl: selfieDataUrlRef.current,
          }),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.error || `Fast search responded ${res.status}.`);
        }
        // Map server photoIds onto the already-loaded gallery files (no re-fetch).
        const byId = new Map(photos.map((p) => [p.id, p]));
        const results: FaceMatch[] = (json.matches ?? [])
          .map((m: { photoId: string; distance: number; faceSize?: number }) => {
            const photo = byId.get(m.photoId);
            return photo ? { photo, distance: m.distance, faceSize: m.faceSize ?? 80 } : null;
          })
          .filter(Boolean) as FaceMatch[];
        const ms = typeof json.ms === 'number' ? json.ms : tTotal.ms();
        fastCacheRef.current.set(cacheKey, { at: Date.now(), results, ms });
        setFastMs(ms);
        const aiN = typeof json.verifiedCount === 'number' ? json.verifiedCount : 0;
        setFastProvider(aiN > 0 ? `NVIDIA AI ✓${aiN}` : 'vector match');
        setFastNote(typeof json.verifyNote === 'string' ? json.verifyNote : null);
        setVerifiedIds(new Set((json.matches ?? []).filter((m: { verified?: boolean }) => m.verified).map((m: { photoId: string }) => m.photoId)));
        reportTimings([
          { stage: 'fast-search-total', ms },
          { stage: 'fast-matrix-search', ms: json.timings?.searchMs ?? 0 },
        ]);
        tTotal.end({ matches: results.length, aiConfirmed: aiN });
        if ((json.indexedFaces ?? 0) === 0) {
          // Searched an empty shelf: say so plainly instead of "no matches".
          applyResults(
            [],
            'Shared index holds 0 photos, so there was nothing to search — tap "Share my index" below (or run Start search first, then share). Meanwhile Start search below still works.'
          );
          return;
        }
        applyResults(
          results,
          `⚡ ${results.length} match${results.length === 1 ? '' : 'es'} in ${(ms / 1000).toFixed(1)}s from ${(json.indexedPhotos ?? 0).toLocaleString('en-IN')} shared photos (bar ${Number(json.threshold ?? searchThreshold).toFixed(2)})${aiN > 0 ? ` · ${aiN} AI-confirmed ✓` : ''}.`
        );
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          setStage('ready');
        } else {
          const msg = err instanceof Error ? err.message : 'Fast search failed.';
          setFastError(`${msg} — you can still use Start search (browser) below.`);
          setStage('ready');
        }
      } finally {
        setFastLoading(false);
        if (mountedRef.current) setScanMode(null);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [consent, imageCount, photos, searchThreshold, selfies]
  );

  const sendNotMe = useCallback(async (photoId: string, distance: number) => {
    try {
      await fetch('/api/face-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, score: 1 - distance, verdict: 'not-me' }),
      });
      setFeedbackSent((prev) => new Set(prev).add(photoId));
      setMatches((prev) => prev.filter((m) => m.photo.id !== photoId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    } catch {
      // feedback is best-effort
    }
  }, []);

  // ---- PICK helpers ----
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const m of filtered) next.add(m.photo.id);
      return next;
    });
  }

  function selectNoneVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const m of filtered) next.delete(m.photo.id);
      return next;
    });
  }

  // ---- EXPORT: copy originals into a ZIP, never move ----
  async function exportZip() {
    const picked = filtered.filter((m) => selectedIds.has(m.photo.id));
    if (picked.length === 0 || exporting) return;
    setExporting(true);
    setExportProgress(`Copying 0/${picked.length}…`);
    setError(null);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let ok = 0;
      const missing: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const photo = picked[i].photo;
        try {
          const res = await fetch(`/api/download?id=${photo.id}&name=${encodeURIComponent(photo.name)}&mode=stream`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          zip.file(photo.name || `photo-${photo.id}.jpg`, blob);
          ok += 1;
        } catch {
          missing.push(photo.name);
        }
        if (mountedRef.current) setExportProgress(`Copying ${i + 1}/${picked.length}…`);
      }
      if (ok === 0) throw new Error('Could not download any of the selected photos.');
      if (mountedRef.current) setExportProgress('Compressing…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-photos-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (mountedRef.current) {
        setExportProgress(
          missing.length > 0
            ? `Exported ${ok} of ${picked.length} (${missing.length} unreachable). Originals untouched.`
            : `Exported ${ok} originals. Nothing was moved or deleted.`
        );
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Export failed. Please try again.');
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }

  // ---- Everyone found ----
  async function loadPeople() {
    setPeopleLoading(true);
    setError(null);
    try {
      const groups = await clusterIndex(photos);
      if (mountedRef.current) {
        setPeopleGroups(groups);
        setShowPeople(true);
        if (groups.length === 0) {
          setError('No grouped faces yet — run a full search first so the index fills up.');
        }
      }
    } catch {
      if (mountedRef.current) setError('Could not group faces yet. Run a search first.');
    } finally {
      if (mountedRef.current) setPeopleLoading(false);
    }
  }

  if (!isOpen) return null;

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const strictLabel = searchThreshold <= 0.42 ? 'Strict' : searchThreshold >= 0.62 ? 'Find all' : 'Balanced';

  // !m-0: this overlay renders inside containers using `space-y-*`, whose
  // sibling margin would otherwise shift the fixed element off-viewport.
  return (
    <div className="fixed inset-0 z-50 !m-0 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Find my photos">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-t-[20px] sm:rounded-[20px] p-5 sm:p-8">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 p-2 rounded-full bg-[#eeece7] hover:bg-[#d9d9dd] text-[#212121] min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#93939f]">Face search · offline in your browser</p>
        <h2 className="text-[28px] sm:text-[40px] font-extrabold text-[#17171c] mt-2 pr-10 leading-none">
          Find my photos.
        </h2>
        <p className="mt-2 text-[14px] sm:text-[15px] text-[#616161] leading-[1.5] flex items-start gap-1.5">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-[#003c33]" />
          Plug in → Find → Select → Export. Nothing is uploaded; originals are only read, never moved.
        </p>

        {!modelsReady && (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-[#616161]">
            <Loader2 className="w-4 h-4 animate-spin" /> {modelStatus}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-[8px] bg-[#ff7759]/10 border border-[#ff7759]/40 px-4 py-3 text-[13px] text-[#b30000]">
            {error}
          </div>
        )}

        {/* ================= 1 WHO ================= */}
        {(stage === 'upload' || stage === 'analyzing-selfie') && cameraOn && (
          <div className="mt-5 rounded-[16px] border border-[#d9d9dd] bg-black overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted autoPlay className="w-full max-h-[320px] object-cover -scale-x-100" />
            <div className="flex gap-2 p-3 bg-white">
              <button onClick={capturePhoto} className="flex-1 inline-flex items-center justify-center rounded-[32px] bg-[#17171c] text-white text-[14px] font-medium px-6 min-h-[48px]">
                <Camera className="w-4 h-4 mr-2" /> Capture selfie
              </button>
              <button
                onClick={stopCamera}
                className="inline-flex items-center justify-center rounded-[32px] border border-[#d9d9dd] text-[#212121] text-[14px] font-medium px-6 min-h-[48px]"
              >
                Back
              </button>
            </div>
          </div>
        )}
        {(stage === 'upload' || stage === 'analyzing-selfie') && !cameraOn && selfies.length === 0 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={stage === 'analyzing-selfie'}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              if (stage !== 'upload') return;
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={`mt-5 w-full rounded-[16px] border-2 border-dashed px-6 py-10 flex flex-col items-center justify-center gap-2 transition min-h-[200px] ${
              isDragging
                ? 'border-[#ff7759] bg-[#ff7759]/10 scale-[1.01]'
                : 'border-[#d9d9dd] hover:border-[#ff7759] bg-[#eeece7]/40 hover:bg-[#ff7759]/5'
            }`}
          >
            {stage === 'analyzing-selfie' ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-[#ff7759]" />
                <span className="text-[14px] font-medium text-[#212121]">Reading your selfie…</span>
              </>
            ) : isDragging ? (
              <>
                <span className="w-12 h-12 rounded-full bg-[#ff7759] text-[#17171c] flex items-center justify-center">
                  <ImagePlus className="w-6 h-6" />
                </span>
                <span className="text-[15px] font-semibold text-[#212121]">Drop it here</span>
                <span className="text-[13px] text-[#616161]">Release to use this photo</span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#93939f]">1 · Who</span>
                <span className="w-12 h-12 rounded-full bg-[#17171c] text-white flex items-center justify-center">
                  <ImagePlus className="w-6 h-6" />
                </span>
                <span className="text-[15px] font-semibold text-[#212121]">Upload a clear photo of the face</span>
                <span className="text-[13px] text-[#616161]">Front-facing, good light. JPG or PNG. One is enough; more angles work better.</span>
              </>
            )}
          </button>
        )}
        {stage === 'upload' && !cameraOn && selfies.length === 0 && (
          <button
            onClick={startCamera}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-[32px] border border-[#17171c] text-[#17171c] hover:bg-[#17171c] hover:text-white text-[14px] font-medium px-6 min-h-[48px] transition"
          >
            <Camera className="w-4 h-4" /> Use live camera instead
          </button>
        )}

        {(stage === 'ready' || stage === 'scanning' || stage === 'done') && selfies.length > 0 && (
          <div className="mt-5 rounded-[16px] border border-[#d9d9dd] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#93939f]">1 · Who — the face to look for</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              <div className="flex gap-2 justify-center sm:justify-start shrink-0 flex-wrap">
                {selfies.map((s, i) => (
                  <span key={i} className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.previewUrl} alt={`Reference selfie ${i + 1}`} className="w-20 h-20 rounded-[12px] object-cover" />
                    {selfies.length > 1 && stage !== 'scanning' && (
                      <button
                        onClick={() => removeSelfie(i)}
                        aria-label={`Remove selfie ${i + 1}`}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#17171c] text-white text-[12px] font-bold flex items-center justify-center shadow"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {selfies.length < MAX_SELFIES && stage !== 'scanning' && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Add another angle — improves accuracy"
                    className="w-20 h-20 rounded-[12px] border-2 border-dashed border-[#d9d9dd] hover:border-[#ff7759] text-[#616161] hover:text-[#ff7759] flex flex-col items-center justify-center gap-1 transition"
                  >
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[10px] font-semibold leading-tight">Add<br />angle</span>
                  </button>
                )}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-[14px] font-semibold text-[#212121]">
                  {selfies.length} {selfies.length === 1 ? 'reference saved' : 'references saved'}
                </p>
                <p className="text-[12px] text-[#616161]">
                  Add front + left + right + glasses + an older photo for best recall. Will scan {imageCount.toLocaleString('en-IN')} photos.
                </p>
                {agreement && (
                  <p className={`mt-1 text-[12px] font-medium ${agreement.min > 0.55 ? 'text-[#b30000]' : 'text-[#003c33]'}`}>
                    {agreement.min > 0.55
                      ? `Warning: these photos don't look like the same person (disagreement ${agreement.min.toFixed(2)}). Matching will be unreliable — use photos of one person.`
                      : `References agree (${agreement.min.toFixed(2)} apart — good).`}
                  </p>
                )}
              </div>
            </div>

            {/* ================= 2 WHERE ================= */}
            <div className="mt-4 rounded-[12px] bg-[#eeece7]/50 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#93939f]">2 · Strictness</p>
                <p className="text-[12px] font-bold text-[#17171c]">
                  {searchThreshold.toFixed(2)} · {strictLabel}
                </p>
              </div>
              <input
                type="range"
                min={MATCH_MIN}
                max={MATCH_MAX}
                step={0.01}
                value={searchThreshold}
                disabled={stage === 'scanning'}
                onChange={(e) => setSearchThreshold(Number(e.target.value))}
                className="mt-2 w-full accent-[#ff7759]"
                aria-label="Search strictness"
              />
              <div className="flex justify-between text-[11px] text-[#93939f]">
                <span>0.35 strict</span>
                <span>0.55 balanced</span>
                <span>0.70 find all</span>
              </div>
              <p className="mt-2 text-[12px] text-[#616161]">
                {coverage
                  ? `${coverage.indexed.toLocaleString('en-IN')} of ${coverage.total.toLocaleString('en-IN')} photos already indexed. Re-search answers in ~1s; full search reads anything new.`
                  : 'First search reads every photo once, then repeats are instant from the index.'}
              </p>
              {/* ⚡ Fast path — shared vector index + NVIDIA AI double-check, answers in seconds */}
              <div className="mt-3 rounded-[12px] border border-[#003c33]/30 bg-[#003c33]/5 p-3">
                <label className="flex items-start gap-2 text-[12px] text-[#212121] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#003c33]"
                  />
                  <span>
                    I consent to this selfie being used to find my photos (for ⚡ Fast search the selfie
                    is also shown to NVIDIA&apos;s AI to double-check top matches), and I understand only my own
                    matches are shown. Students may be minors — ask a parent/teacher if unsure.
                  </span>
                </label>
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => { setVisibleCount(48); void fastSearch(); }}
                    disabled={!consent || fastLoading || stage === 'scanning'}
                    title={serverFaces ? `Shared index holds ${serverFaces} faces — answers in seconds` : 'Shared index is empty — run a browser search, then share it'}
                    className="flex-1 inline-flex items-center justify-center rounded-[32px] bg-[#003c33] hover:bg-[#004d40] disabled:opacity-40 text-white text-[14px] font-bold px-6 min-h-[48px] transition"
                  >
                    {fastLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanFace className="w-4 h-4 mr-2" />}
                    ⚡ Fast search {serverFaces ? `(${serverFaces.toLocaleString('en-IN')} faces ready)` : ''}{fastMs ? ` · last ${(fastMs / 1000).toFixed(1)}s${fastProvider ? ` · ${fastProvider}` : ''}` : ''}
                  </button>
                </div>
                {fastError && <p className="mt-2 text-[12px] text-[#b30000]">{fastError}</p>}
                {fastNote && <p className="mt-2 text-[12px] text-[#616161]">{fastNote}</p>}
                <div className="mt-2">
                  <p className="text-[11px] text-[#93939f]">
                    {(serverFaces ?? 0) === 0
                      ? 'Shared index is empty — that is why Fast search finds nothing yet. Run Start search below once, then share it so everyone searches in seconds.'
                      : 'Make Fast search better for everyone by sharing the faces this device already computed (no photos re-read).'}
                  </p>
                  <button
                    onClick={contributeIndex}
                    className="mt-2 inline-flex items-center justify-center rounded-[32px] border border-[#003c33] text-[#003c33] text-[13px] font-semibold px-5 min-h-[44px]"
                  >
                    Share my index for everyone
                  </button>
                  {contribState && <p className="mt-1 text-[11px] text-[#003c33]">{contribState}</p>}
                </div>
              </div>
              {stage === 'scanning' && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-[#eeece7] overflow-hidden">
                    <div className="h-full bg-[#ff7759] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-[#93939f]">
                    {scanMode === 'index' ? 'Re-scoring index… ' : ''}
                    {progress.done.toLocaleString('en-IN')} / {progress.total.toLocaleString('en-IN')} ({pct}%)
                    {etaLabel ? ` — ${etaLabel}` : ''} · matches tick themselves below as found
                  </p>
                </div>
              )}
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                {stage === 'ready' && (
                  <>
                    <button
                      onClick={() => startScan()}
                      disabled={!modelsReady}
                      className="flex-1 inline-flex items-center justify-center rounded-[32px] bg-[#17171c] hover:bg-black disabled:opacity-50 text-white text-[14px] font-medium px-6 min-h-[48px] transition"
                    >
                      <ScanFace className="w-4 h-4 mr-2" /> Start search
                    </button>
                    <button
                      onClick={() => requery()}
                      disabled={!modelsReady || !coverage || coverage.indexed === 0}
                      title={coverage && coverage.indexed > 0 ? 'Re-score stored faces, about a second' : 'Nothing indexed yet — run a full search first'}
                      className="flex-1 inline-flex items-center justify-center rounded-[32px] border border-[#17171c] text-[#17171c] hover:bg-[#17171c] hover:text-white disabled:opacity-40 text-[14px] font-medium px-6 min-h-[48px] transition"
                    >
                      Re-search index
                    </button>
                  </>
                )}
                {stage === 'scanning' && (
                  <button
                    onClick={cancelScan}
                    className="inline-flex items-center justify-center rounded-[32px] border border-[#b30000] text-[#b30000] text-[14px] font-medium px-6 min-h-[48px]"
                  >
                    Stop
                  </button>
                )}
                {stage === 'done' && (
                  <>
                    <button
                      onClick={() => startScan()}
                      disabled={!modelsReady}
                      className="flex-1 inline-flex items-center justify-center rounded-[32px] bg-[#17171c] hover:bg-black disabled:opacity-50 text-white text-[14px] font-medium px-6 min-h-[48px] transition"
                    >
                      <ScanFace className="w-4 h-4 mr-2" /> Scan again
                    </button>
                    <button
                      onClick={() => requery()}
                      disabled={!modelsReady}
                      className="flex-1 inline-flex items-center justify-center rounded-[32px] border border-[#d9d9dd] text-[#212121] hover:border-[#17171c] text-[14px] font-medium px-6 min-h-[48px] transition"
                    >
                      Re-search index
                    </button>
                  </>
                )}
                {(stage === 'ready' || stage === 'done') && (
                  <button
                    onClick={resetSelfie}
                    className="inline-flex items-center justify-center gap-1 text-[13px] font-medium text-[#616161] hover:text-[#17171c] min-h-[44px] px-3"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Start over
                  </button>
                )}
              </div>
              {requeryNote && stage === 'done' && (
                <p className="mt-2 text-[12px] text-[#003c33]">{requeryNote}</p>
              )}
            </div>
          </div>
        )}

        {/* ================= 3 PICK ================= */}
        {(stage === 'scanning' || stage === 'done') && (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#d9d9dd] flex-wrap">
              <h3 className="text-[18px] font-semibold text-[#212121]">
                {stage === 'done' ? (
                  matches.length > 0 ? (
                    <>3 · Pick — your photos ({filtered.length} of {matches.length} shown)</>
                  ) : (
                    <>No matches at this strictness</>
                  )
                ) : (
                  <>Scanning… {matches.length} found</>
                )}
              </h3>
              {filtered.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={selectAllVisible} className="text-[13px] font-medium text-[#1863dc] hover:underline min-h-[44px] px-2">All</button>
                  <button onClick={selectNoneVisible} className="text-[13px] font-medium text-[#616161] hover:underline min-h-[44px] px-2">None</button>
                </div>
              )}
            </div>

            {matches.length > 0 && (
              <div className="mt-3 rounded-[12px] border border-[#d9d9dd] bg-[#eeece7]/40 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-[#616161]">Only show matches this good</p>
                  <p className="text-[12px] font-bold text-[#17171c]">{filterThreshold.toFixed(2)}</p>
                </div>
                <input
                  type="range"
                  min={FILTER_MIN}
                  max={searchThreshold}
                  step={0.01}
                  value={Math.min(filterThreshold, searchThreshold)}
                  onChange={(e) => setFilterThreshold(Number(e.target.value))}
                  className="mt-1 w-full accent-[#17171c]"
                  aria-label="Result filter"
                />
                <p className="text-[11px] text-[#93939f]">Instant — no rescan. Drag left to loosen, right to tighten. To go looser than {searchThreshold.toFixed(2)}, raise strictness above and Re-search.</p>
              </div>
            )}

            {(stage === 'scanning' && matches.length === 0) && (
              <div className="pt-3 grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-label="Loading matches">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] w-full animate-pulse rounded-[12px] bg-[#eeece7]" />
                ))}
              </div>
            )}
            {stage === 'done' && matches.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[15px] font-medium text-[#212121]">No matches at this strictness.</p>
                <p className="mt-1 text-[13px] text-[#616161] max-w-md mx-auto">
                  Drag strictness toward Find all (0.65–0.70) and Re-search — or add more reference angles (front, left, right).
                </p>
                <button onClick={resetSelfie} className="mt-4 inline-flex items-center justify-center rounded-[32px] bg-[#17171c] text-white text-[14px] font-medium px-6 min-h-[48px]">
                  <Upload className="w-4 h-4 mr-2" /> Try another photo
                </button>
              </div>
            ) : filtered.length > 0 ? (
              <>
                <p className="pt-3 text-[12px] text-[#64748b]">
                  Best match first. Click a tile to tick it · double-click to open full size. The % chip is the match confidence.
                </p>
                <div className="pt-3 grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filtered.slice(0, visibleCount).map((m, idx) => {
                    const selected = selectedIds.has(m.photo.id);
                    const flagged = feedbackSent.has(m.photo.id);
                    return (
                      <div
                        key={m.photo.id}
                        onClick={() => toggleSelect(m.photo.id)}
                        onDoubleClick={() => setLightboxIndex(idx)}
                        className={`group relative cursor-pointer overflow-hidden rounded-[12px] border-2 transition ${selected ? 'border-[#ff7759] shadow-md' : 'border-transparent hover:border-[#d9d9dd]'}`}
                        title={`${m.photo.name} — double-click to open`}
                      >
                        <ResultThumb
                          photo={m.photo}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <span
                          className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border shadow ${selected ? 'bg-[#ff7759] border-[#ff7759] text-white' : 'bg-white/90 border-white text-transparent'}`}
                          aria-hidden
                        >
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                        <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
                          {confidence(m.distance)}
                        </span>
                        {verifiedIds.has(m.photo.id) && (
                          <span className="absolute left-2 bottom-2 rounded-full bg-[#003c33]/90 px-2 py-1 text-[10px] font-bold text-white">
                            ✓ AI-checked
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); void sendNotMe(m.photo.id, m.distance); }}
                          disabled={flagged}
                          title="Not me — removes this photo and helps tune matching"
                          className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-[#616161] hover:text-[#b30000] disabled:opacity-50"
                        >
                          {flagged ? 'Flagged' : 'Not me'}
                        </button>
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[11px] text-white/90">
                          {m.photo.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {filtered.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount((c) => c + 48)}
                    className="mt-3 w-full inline-flex items-center justify-center rounded-[32px] border border-[#d9d9dd] text-[#212121] text-[13px] font-medium px-6 min-h-[44px]"
                  >
                    Show more ({filtered.length - visibleCount} remaining)
                  </button>
                )}

                {/* ================= 4 EXPORT ================= */}
                <div className="mt-4 rounded-[12px] bg-[#17171c] text-white p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">4 · Export</p>
                    <p className="mt-1 text-[14px] font-semibold">
                      {selectedCount.toLocaleString('en-IN')} selected
                      {exportProgress ? ` · ${exportProgress}` : ' · originals are copied, never moved'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={exportZip}
                      disabled={exporting || selectedCount === 0}
                      className="inline-flex items-center justify-center gap-1.5 rounded-[32px] bg-[#ff7759] hover:bg-[#ff8a5c] disabled:opacity-50 text-[#17171c] text-[14px] font-bold px-6 min-h-[48px] transition whitespace-nowrap"
                    >
                      {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                      Export selected…
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-[#616161] flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Tip: open any tile full size to download that single original.
                </p>
              </>
            ) : (
              <p className="py-8 text-center text-[13px] text-[#616161]">
                Everything is filtered out at {filterThreshold.toFixed(2)} — drag the filter left to let borderline faces through.
              </p>
            )}
          </div>
        )}

        {/* ================= Everyone found ================= */}
        {(stage === 'ready' || stage === 'done') && (coverage?.indexed ?? 0) > 0 && (
          <div className="mt-6 rounded-[12px] border border-[#d9d9dd] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-[#212121] flex items-center gap-2">
                <Users className="w-4 h-4" /> Everyone found on this gallery
              </p>
              <button
                onClick={loadPeople}
                disabled={peopleLoading}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[#1863dc] hover:underline min-h-[44px]"
              >
                {peopleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {showPeople ? 'Refresh groups' : 'Group faces'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12px] text-[#616161]">Groups every indexed face into people — no photo is re-read. Click a face to see their files.</p>
            {showPeople && !peopleView && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {peopleGroups.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => setPeopleView(g)}
                    className="rounded-[12px] border border-[#d9d9dd] hover:border-[#ff7759] overflow-hidden bg-white text-left transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <ResultThumb photo={g.best.photo} alt="" className="aspect-square w-full object-cover" />
                    <span className="block px-2 py-1.5 text-[11px] font-semibold text-[#212121]">{g.nFiles} file{g.nFiles === 1 ? '' : 's'}</span>
                  </button>
                ))}
                {peopleGroups.length === 0 && !peopleLoading && (
                  <p className="col-span-full text-[12px] text-[#616161]">Nothing grouped yet.</p>
                )}
              </div>
            )}
            {showPeople && peopleView && (
              <div className="mt-3">
                <button onClick={() => setPeopleView(null)} className="text-[13px] font-medium text-[#1863dc] hover:underline">← All groups</button>
                <p className="mt-1 text-[12px] text-[#616161]">{peopleView.nFiles} files · {peopleView.size} faces</p>
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {peopleView.faces.map((f, i) => (
                    <span key={`${f.photo.id}-${i}`} className="overflow-hidden rounded-[10px] border border-[#eeece7]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <ResultThumb photo={f.photo} className="aspect-square w-full object-cover" />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <p className="text-[11px] text-[#93939f]">First search is slow (reads every photo once) · repeats answer from the index in ~1s.</p>
          {!cacheCleared ? (
            <button
              onClick={() => {
                clearFaceCache().then(() => {
                  setCacheCleared(true);
                  setCoverage({ indexed: 0, total: imageCount });
                });
              }}
              className="text-[11px] text-[#93939f] hover:text-[#b30000] underline underline-offset-2 shrink-0 ml-3"
            >
              Clear face index
            </button>
          ) : (
            <span className="text-[11px] text-[#003c33] shrink-0 ml-3">Index cleared</span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          // Mobile-first: lets phones offer the camera directly from this picker.
          capture="user"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {lightboxIndex !== null && filtered[lightboxIndex] && (
          <PhotoLightbox
            photos={filtered.map((m) => m.photo)}
            currentIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={(idx) => setLightboxIndex(idx)}
          />
        )}
      </div>
    </div>
  );
}
