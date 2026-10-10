// Face-search engine: runs 100% in the visitor's browser, no API key needed.
// Uses @vladmandic/face-api (TinyFaceDetector + 68 landmarks + recognition net)
// with models served from /public/models. Gallery images are loaded through
// the same-origin /api/download proxy so the canvas never gets tainted.
// Descriptors are cached in IndexedDB so repeat scans are near-instant.

import type { DriveFile } from '@/types';
import { startTiming } from '@/lib/faceTimings';

type FaceApi = typeof import('@vladmandic/face-api');

const MODEL_URL = '/models';
// Single fixed operating point (no sensitivity switch — one mode that finds
// ALL of the user's photos and nothing else):
// - First pass is generous (0.55) so no true photo is missed at thumbnail size.
// - Precision comes from the guards AFTER it: detector-score gate,
//   size-gated bars, and the full-resolution second opinion that every
//   candidate must pass before being shown.
//
// NOMIN port: the UI now exposes a strictness slider, so this is only the
// default. Re-query + filter sliders reuse the same scale.
export const MATCH_THRESHOLD = 0.55;
export const MATCH_DEFAULT = 0.55;
export const MATCH_MIN = 0.35; // strict — fewer, surer matches
export const MATCH_MAX = 0.7; // loose / "find all" — more, review them
export const FILTER_MIN = 0.2;
// Reference selfie must be high quality; gallery faces can be much smaller
// (group photos) and still match reliably once detected.
const MIN_SELFIE_FACE_SIZE = 60;
const MIN_GALLERY_FACE_SIZE = 36;
// The detector rescales to GALLERY_INPUT_SIZE regardless, so this only governs
// descriptor crop quality and decode cost. Measured at 1280 vs 1600: identical
// faces found, ~17% less compute and ~36% fewer bytes to fetch.
const MAX_SCAN_DIM = 1280;

/**
 * Minimum detector confidence for a face to count. Applied as the detector's
 * own scoreThreshold, so weak boxes never reach the expensive landmark and
 * descriptor nets — below this a box is more likely a garland, statue or
 * background pattern than a real face.
 */
const MIN_DETECT_SCORE = 0.35;

/**
 * How far below the match threshold a result counts as "confident" and skips
 * the second-opinion pass. At the 0.55 default that means anything under 0.45
 * is accepted outright — comfortably inside the same-person range, where a
 * re-check has never changed the verdict.
 */
const CONFIRM_MARGIN = 0.1;

/**
 * TinyFaceDetector rescales the whole canvas to inputSize×inputSize, so THIS —
 * not the canvas size — is what decides whether a distant face survives to be
 * detected at all.
 *
 * At the old 512 an assembly photo yielded ~1.4 faces on average and 39% of the
 * gallery detected no face whatsoever, which is why people were missing from
 * their own results: a face that is never detected can never match. Measured on
 * assembly photos, raising this to 1024 took one frame from 4 detected faces to
 * 31, and another from 6 to 18.
 */
const GALLERY_INPUT_SIZE = 1024;
// Detection is GPU/CPU-bound and image loading is network-bound, so they get
// separate budgets: a small detect pool keeps the tab responsive while a wider
// prefetch pool keeps that pool fed (see the pipeline in findMatchingPhotos).
const SCAN_CONCURRENCY = 4;
const PREFETCH_AHEAD = 8;

let faceapiPromise: Promise<FaceApi> | null = null;
let modelsPromise: Promise<void> | null = null;

async function getFaceApi(): Promise<FaceApi> {
  if (!faceapiPromise) {
    faceapiPromise = import('@vladmandic/face-api');
  }
  return faceapiPromise;
}

/**
 * Loads the three nets in parallel and warms the detector once.
 *
 * The result is memoised as a *promise*, not a boolean: the modal, the selfie
 * reader and the scanner all call this, and a boolean flag let concurrent
 * callers each kick off their own full download of the same ~7 MB of weights.
 */
export async function ensureFaceModels(onStatus?: (msg: string) => void): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const t = startTiming('face-models-load');
      const faceapi = await getFaceApi();
      onStatus?.('Loading face models… (one-time, ~7 MB)');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      onStatus?.('Warming up…');
      // First inference pays WebGL shader compilation. Spend it on a 1-pixel
      // throwaway now rather than on the user's first real photo.
      try {
        const warm = document.createElement('canvas');
        warm.width = 320;
        warm.height = 320;
        await faceapi.detectAllFaces(warm, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }));
      } catch {
        // Warmup is an optimisation, never a hard requirement.
      }
      t.end();
      onStatus?.('Ready');
    })().catch((err) => {
      modelsPromise = null; // let a later attempt retry after a network blip
      throw err;
    });
  }
  return modelsPromise;
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

// Shrink to a work canvas so 12 MP Drive photos detect in ~100 ms not seconds.
// Selfies keep more resolution — a small face in a big frame still needs pixels.
function toWorkCanvas(img: HTMLImageElement, maxDim = MAX_SCAN_DIM): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Same-origin thumbnail URL — canvas-safe (no CORS taint). w1000 keeps
 *  group-photo faces big enough to detect (w500 made them too tiny). */
export function proxyImageUrl(photo: DriveFile): string {
  return `/api/thumb?id=${photo.id}&sz=w1280`;
}

/** Full-file fallback for the rare photo with no Drive thumbnail. */
function fullImageUrl(photo: DriveFile): string {
  return `/api/download?id=${photo.id}&name=${encodeURIComponent(photo.name)}&mode=stream`;
}

/** Canvas size for the second-opinion re-check — deliberately larger than
 *  MAX_SCAN_DIM so the re-check genuinely sees more pixels than the scan did.
 *  The fetched thumbnail is w1000, so this uses it at native resolution. */
const CONFIRM_DIM = 1280;

async function loadScannableImage(photo: DriveFile): Promise<HTMLImageElement> {
  try {
    return await loadImageElement(proxyImageUrl(photo));
  } catch {
    return loadImageElement(fullImageUrl(photo));
  }
}

type DetectProfile = 'gallery' | 'selfie';

interface FullDetection {
  detection: { box: { width: number; height: number }; score: number };
  descriptor: Float32Array;
}

/**
 * Detection passes.
 *
 * Selfies keep the escalating cascade — it is a single image, accuracy matters
 * most, and the cost is irrelevant.
 *
 * Gallery photos use ONE pass at the most sensitive setting. The old cascade
 * stopped at the first non-empty pass, which meant every photo containing no
 * face at all — landscapes, decorations, stage wides — paid for all three
 * passes. That is the most common case in a 4,000-photo gallery, so it
 * dominated scan time. A single 512/0.2 pass detects a superset of what the
 * 512/0.3 and 512/0.25 passes found, and `MIN_DETECT_SCORE` still gates which
 * boxes are allowed to match, so recall is preserved at a third of the cost.
 */
async function detectFaces(
  faceapi: FaceApi,
  canvas: HTMLCanvasElement,
  profile: DetectProfile,
  inputSizeOverride?: number
): Promise<FullDetection[]> {
  const passes =
    profile === 'selfie'
      ? [
          { inputSize: 512, scoreThreshold: 0.3 },
          { inputSize: 416, scoreThreshold: 0.25 },
          { inputSize: 320, scoreThreshold: 0.2 },
        ]
      : [
          {
            inputSize: inputSizeOverride ?? GALLERY_INPUT_SIZE,
            // Gate in the DETECTOR, not after it. Landmarks + descriptors are
            // ~73% of the per-photo cost and were being computed for every weak
            // box — 35% of which `MIN_DETECT_SCORE` then threw away at match
            // time. Filtering here yields the identical surviving face set
            // (measured: 145 either way) for about a third less work.
            scoreThreshold: MIN_DETECT_SCORE,
          },
        ];
  for (const p of passes) {
    const detections = (await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions(p))
      .withFaceLandmarks()
      .withFaceDescriptors()) as FullDetection[];
    if (detections.length > 0) return detections;
  }
  return [];
}

async function descriptorsForCanvas(
  faceapi: FaceApi,
  canvas: HTMLCanvasElement,
  profile: DetectProfile = 'gallery'
): Promise<Float32Array[]> {
  const detections = await detectFaces(faceapi, canvas, profile);
  return detections.map((d) => d.descriptor);
}

export async function descriptorsForImageUrl(url: string): Promise<Float32Array[]> {
  const faceapi = await getFaceApi();
  await ensureFaceModels();
  const img = await loadImageElement(url);
  try {
    return await descriptorsForCanvas(faceapi, toWorkCanvas(img));
  } finally {
    img.src = '';
  }
}

/** Reference selfie: uses the LARGEST face (ignores bystanders in the selfie). */
export async function descriptorForSelfie(file: File): Promise<{ descriptor: Float32Array; previewUrl: string }> {
  const tTotal = startTiming('selfie-total');
  const faceapi = await getFaceApi();
  await ensureFaceModels();
  const previewUrl = URL.createObjectURL(file);
  const tDecode = startTiming('selfie-decode');
  const img = await loadImageElement(previewUrl);
  tDecode.end({ w: img.naturalWidth, h: img.naturalHeight });
  try {
    const canvas = toWorkCanvas(img, 1024);
    const tDetect = startTiming('selfie-detect-embed');
    const detections = await detectFaces(faceapi, canvas, 'selfie');
    tDetect.end({ faces: detections.length });
    if (detections.length === 0) {
      throw new Error(
        'No face found in that photo — move closer to the camera, face forward in good light, and remove sunglasses or masks.'
      );
    }
    // Largest box = the person holding the camera.
    let best = detections[0];
    let bestArea = 0;
    for (const d of detections) {
      const area = d.detection.box.width * d.detection.box.height;
      if (area > bestArea) {
        bestArea = area;
        best = d;
      }
    }
    if (best.detection.box.width < MIN_SELFIE_FACE_SIZE || best.detection.box.height < MIN_SELFIE_FACE_SIZE) {
      throw new Error(
        'Your face is too small in that photo — move much closer to the camera and try again.'
      );
    }
    tTotal.end({ faceW: Math.round(best.detection.box.width), faces: detections.length });
    return { descriptor: best.descriptor, previewUrl };
  } catch (err) {
    URL.revokeObjectURL(previewUrl);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB descriptor cache
// ---------------------------------------------------------------------------

interface CachedEntry {
  photoId: string;
  modifiedTime: string;
  descriptors: number[][];
  /** Detected face size (work-canvas px) per descriptor — drives size gating. */
  sizes?: number[];
  /** Detector confidence per descriptor — weak boxes are usually non-faces. */
  scores?: number[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openCacheDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('No IndexedDB'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('gurukul-face-cache-v6', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('descriptors')) {
          db.createObjectStore('descriptors', { keyPath: 'photoId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }
  return dbPromise;
}

/**
 * The whole descriptor index, read once with a single getAll() and then kept
 * in memory for the session.
 *
 * This replaces a per-photo readonly transaction. A scan, a coverage probe and
 * a re-query each walked every photo in the gallery, so a warm 4,000-photo
 * gallery cost ~12,000 separate IndexedDB round-trips — which was slower than
 * the face detection it was meant to avoid. One getAll() costs a few hundred
 * milliseconds and every later lookup is a Map hit.
 */
let indexPromise: Promise<Map<string, CachedEntry>> | null = null;

function loadIndex(): Promise<Map<string, CachedEntry>> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const map = new Map<string, CachedEntry>();
      try {
        const db = await openCacheDB();
        const rows = await new Promise<CachedEntry[]>((resolve) => {
          const tx = db.transaction('descriptors', 'readonly');
          const req = tx.objectStore('descriptors').getAll();
          req.onsuccess = () => resolve((req.result as CachedEntry[]) ?? []);
          req.onerror = () => resolve([]);
        });
        for (const row of rows) {
          if (row && row.photoId) map.set(row.photoId, row);
        }
      } catch {
        // No IndexedDB (private mode, blocked storage) — scanning still works,
        // it just re-derives descriptors every time.
      }
      return map;
    })();
  }
  return indexPromise;
}

// Writes are batched: one transaction per flush instead of one per photo.
let pendingWrites: CachedEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushWrites(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = pendingWrites;
  pendingWrites = [];
  if (batch.length === 0) return;
  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('descriptors', 'readwrite');
      const store = tx.objectStore('descriptors');
      for (const entry of batch) store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Cache is best-effort; scanning still works without it.
  }
}

function getCached(photoId: string, index: Map<string, CachedEntry>): CachedEntry | null {
  return index.get(photoId) ?? null;
}

function setCached(entry: CachedEntry, index: Map<string, CachedEntry>): void {
  index.set(entry.photoId, entry);
  pendingWrites.push(entry);
  if (pendingWrites.length >= 200) {
    void flushWrites();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => void flushWrites(), 1000);
  }
}

export async function clearFaceCache(): Promise<void> {
  pendingWrites = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  indexPromise = Promise.resolve(new Map());
  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('descriptors', 'readwrite');
      tx.objectStore('descriptors').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/** One detected face: recognition vector + quality signals. */
export interface FaceDescriptor {
  vec: Float32Array;
  /** min(box.width, box.height) in work-canvas px — small = less trustworthy. */
  size: number;
  /** Detector confidence 0..1 — low scores are usually decorations/crowd blur. */
  score: number;
}


/** Decoded-vector memo, so re-query and clustering don't rebuild Float32Arrays
 *  for the entire gallery on every pass. Keyed by the stored row itself, so it
 *  is dropped automatically when the row is replaced. */
const decodedCache = new WeakMap<CachedEntry, FaceDescriptor[]>();

function cachedDescriptors(
  photo: DriveFile,
  index: Map<string, CachedEntry>
): FaceDescriptor[] | null {
  const hit = getCached(photo.id, index);
  if (!hit || hit.modifiedTime !== photo.modifiedTime || !Array.isArray(hit.descriptors)) {
    return null;
  }
  const memo = decodedCache.get(hit);
  if (memo) return memo;
  const decoded = hit.descriptors.map((d, i) => ({
    vec: new Float32Array(d),
    size: Array.isArray(hit.sizes) && typeof hit.sizes[i] === 'number' ? hit.sizes[i] : 80,
    score: Array.isArray(hit.scores) && typeof hit.scores[i] === 'number' ? hit.scores[i] : 1,
  }));
  decodedCache.set(hit, decoded);
  return decoded;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface FaceMatch {
  photo: DriveFile;
  distance: number;
  /** Size of the matched face — shown for transparency, smallest = weakest. */
  faceSize: number;
}

function euclidean(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Small/blurry faces produce noisy descriptors — the acceptance bar tightens
 * as the face gets smaller. The full-resolution second opinion guards
 * precision, so these tiers stay moderate to protect recall.
 */
function sizeAdjustedThreshold(faceSize: number, base: number): number {
  if (faceSize >= 80) return base;
  if (faceSize >= 55) return base - 0.04;
  if (faceSize >= 40) return base - 0.08;
  return base - 0.12;
}

export interface ScanOptions {
  /** One or more reference descriptors (multiple selfie angles = best accuracy). */
  references: Float32Array[];
  photos: DriveFile[];
  threshold?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, matchCount: number) => void;
  onMatch?: (match: FaceMatch) => void;
  // When provided, vector-match candidates are auto-confirmed through the
  // /api/verify-face vision check BEFORE being shown — so results only ever
  // contain photos the person is actually in. Undecided (API error) stays.
  verifyWithAI?: {
    referenceDataUrl: string;
    maxCandidates?: number;
    verifyConcurrency?: number;
    onVerifyProgress?: (done: number, total: number) => void;
    onAINote?: (msg: string) => void;
  };
}

/**
 * Scans gallery photos for the reference face(s). Streams matches as found,
 * reports progress, honours AbortSignal. Images only — videos/audio skipped.
 *
 * Accuracy design (precision AND recall):
 * - Multiple references (selfie angles): a photo matches if it is close to
 *   ANY reference — true photos match one angle closely, while strangers
 *   rarely match any reference closely.
 * - Size-gated acceptance: each detected face must beat a threshold tightened
 *   for its size, so small blurry faces can't sneak in as lookalikes.
 */
export async function findMatchingPhotos(opts: ScanOptions): Promise<FaceMatch[]> {
  const tScan = startTiming('gallery-scan-total');
  const stageMs = { fetch: 0, detectEmbed: 0, compare: 0, confirm: 0 };
  let nFetched = 0;
  let nDetected = 0;
  let nCacheHit = 0;
  const faceapi = await getFaceApi();
  await ensureFaceModels();
  if (!opts.references || opts.references.length === 0) {
    throw new Error('No reference face provided');
  }
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  const tIndex = startTiming('gallery-index-load');
  const index = await loadIndex();
  tIndex.end({ entries: index.size });
  // Newest first: the user's own recent event photos surface matches early,
  // so perceived wait drops even before the full scan finishes.
  const images = opts.photos
    .filter((p) => (p.mediaType ?? 'image') === 'image')
    .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  const total = images.length;
  const matches: FaceMatch[] = [];
  let done = 0;
  let cursor = 0;

  const checkAborted = () => {
    if (opts.signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
  };

  // ---- Image prefetch pipeline -------------------------------------------
  // Detection is compute-bound and fetching is latency-bound. Without this the
  // detect pool sat idle waiting on Drive for every single photo. Downloads for
  // upcoming photos are started ahead of time so a detect slot almost always
  // has decoded pixels waiting for it.
  const inFlight = new Map<string, Promise<HTMLImageElement>>();

  function prefetchFrom(startIndex: number): void {
    for (let i = startIndex; i < Math.min(startIndex + PREFETCH_AHEAD, images.length); i++) {
      const photo = images[i];
      if (inFlight.has(photo.id)) continue;
      if (cachedDescriptors(photo, index)) continue; // already indexed, no bytes needed
      const p = loadScannableImage(photo).catch(() => null as unknown as HTMLImageElement);
      inFlight.set(photo.id, p);
    }
  }

  function takeImage(photo: DriveFile): Promise<HTMLImageElement> {
    const existing = inFlight.get(photo.id);
    inFlight.delete(photo.id);
    return existing ?? loadScannableImage(photo);
  }

  async function scanOne(photo: DriveFile): Promise<void> {
    checkAborted();
    // Held until after the second-opinion check so that check can reuse these
    // pixels instead of going back to the network.
    let loaded: HTMLImageElement | null = null;
    try {
      let faces = cachedDescriptors(photo, index);
      if (faces) nCacheHit += 1;
      if (!faces) {
        const tFetch = startTiming('scan-fetch');
        loaded = await takeImage(photo);
        stageMs.fetch += tFetch.end(undefined, false);
        nFetched += 1;
        if (!loaded) throw new Error('image unavailable');
        checkAborted();
        const canvas = toWorkCanvas(loaded);
        const tDet = startTiming('scan-detect-embed');
        const detections = await detectFaces(faceapi, canvas, 'gallery');
        stageMs.detectEmbed += tDet.end(undefined, false);
        nDetected += detections.length;
        // Keep small faces too (group photos) — score gate + size gating at
        // match time decide how strictly each one must match.
        faces = detections
          .filter((d) => d.detection.box.width >= MIN_GALLERY_FACE_SIZE && d.detection.box.height >= MIN_GALLERY_FACE_SIZE)
          .map((d) => ({
            vec: d.descriptor,
            size: Math.min(d.detection.box.width, d.detection.box.height),
            score: d.detection.score,
          }));
        setCached(
          {
            photoId: photo.id,
            modifiedTime: photo.modifiedTime,
            descriptors: faces.map((f) => Array.from(f.vec)),
            sizes: faces.map((f) => f.size),
            scores: faces.map((f) => f.score),
          },
          index
        );
      }
      // Best (face, reference) pair wins; each face is judged against the
      // threshold adjusted for ITS size, and weak detector boxes are ignored.
      let best: FaceMatch | null = null;
      const tCmp = startTiming('scan-compare');
      for (const f of faces) {
        if (f.score < MIN_DETECT_SCORE) continue;
        const bar = sizeAdjustedThreshold(f.size, threshold);
        for (const ref of opts.references) {
          const dist = euclidean(ref, f.vec);
          if (dist <= bar && (!best || dist < best.distance)) {
            best = { photo, distance: dist, faceSize: f.size };
          }
        }
      }
      stageMs.compare += tCmp.end(undefined, false);
      // SECOND OPINION, only where it can change the answer.
      //
      // This runs a whole extra detection pass, so doing it for every candidate
      // roughly doubled the cost of any photo the person is actually in — the
      // more matches someone had, the slower their search got. A comfortably
      // close match is not going to be overturned by a second look, so only
      // borderline ones (within CONFIRM_MARGIN of the bar) pay for it.
      const confidentBar = threshold - CONFIRM_MARGIN;
      if (best && best.distance > confidentBar) {
        const tConfirm = startTiming('scan-confirm');
        const ok = await confirmAtHigherRes(best, loaded);
        stageMs.confirm += tConfirm.end(undefined, false);
        if (!ok) best = null;
      }
      if (best) {
        matches.push(best);
        opts.onMatch?.(best);
      }
    } catch {
      // One bad file (deleted, corrupt, no bytes) must never kill the scan.
    } finally {
      if (loaded) loaded.src = '';
      done += 1;
      opts.onProgress?.(done, total, matches.length);
    }
  }

  /**
   * Re-checks a candidate at higher resolution than the scan pass used. True
   * faces confirm (more pixels = same-or-better match); false alarms don't.
   * If the image can't be loaded, the candidate stays (undecided, not rejected).
   *
   * `alreadyLoaded` is the image the scan just detected on. Reusing it is the
   * whole point: re-fetching a larger copy per candidate put a network round
   * trip inside a detect worker, which stalled the entire scan whenever a few
   * candidates landed at once. Only cache-hit candidates — where no image was
   * loaded — pay for a fetch here.
   */
  async function confirmAtHigherRes(
    candidate: FaceMatch,
    alreadyLoaded: HTMLImageElement | null
  ): Promise<boolean> {
    let ownedImg: HTMLImageElement | null = null;
    try {
      checkAborted();
      let img = alreadyLoaded;
      if (!img) {
        ownedImg = await loadImageElement(proxyImageUrl(candidate.photo));
        img = ownedImg;
      }
      try {
        checkAborted();
        const canvas = toWorkCanvas(img, CONFIRM_DIM);
        // Deliberately a DIFFERENT detector scale from the scan pass. Now that
        // the scan already runs at full resolution there are no extra pixels to
        // be had, so corroboration comes from the face surviving a second,
        // independent scale rather than from a bigger image.
        const detections = await detectFaces(faceapi, canvas, 'gallery', 608);
        if (detections.length === 0) return true; // undecided stays
        // Full-res bar is strict but capped: true faces score ~0.3–0.45 here.
        const bar = Math.min(threshold - 0.02, 0.5);
        let best = Infinity;
        for (const d of detections) {
          if (d.detection.score < MIN_DETECT_SCORE) continue;
          for (const ref of opts.references) {
            const dist = euclidean(ref, d.descriptor);
            if (dist < best) best = dist;
          }
        }
        return best <= bar;
      } finally {
        // Only release what we opened — the scan still owns `alreadyLoaded`.
        if (ownedImg) ownedImg.src = '';
      }
    } catch {
      return true; // couldn't load the image — keep, don't punish
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      checkAborted();
      const next = cursor;
      cursor += 1;
      if (next >= images.length) return;
      prefetchFrom(next + 1);
      await scanOne(images[next]);
    }
  }

  prefetchFrom(0);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(SCAN_CONCURRENCY, images.length); i++) {
    workers.push(worker());
  }
  try {
    await Promise.all(workers);
  } finally {
    // Keep whatever we indexed, even if the user cancelled part-way — the next
    // scan then starts from a warmer index instead of redoing the work.
    inFlight.clear();
    await flushWrites();
  }
  matches.sort((a, b) => a.distance - b.distance);
  tScan.end({
    total,
    fetched: nFetched,
    cacheHit: nCacheHit,
    faces: nDetected,
    matches: matches.length,
    fetchMs: Math.round(stageMs.fetch),
    detectEmbedMs: Math.round(stageMs.detectEmbed),
    compareMs: Math.round(stageMs.compare),
    confirmMs: Math.round(stageMs.confirm),
  });
  return matches;
}

// ---------------------------------------------------------------------------
// NOMIN port: enrol / re-query / re-threshold / clustering
// ---------------------------------------------------------------------------

/** Average 1+ reference descriptors into one NOMIN-style identity vector. */
export function averageDescriptors(refs: Float32Array[]): Float32Array | null {
  if (!refs || refs.length === 0) return null;
  if (refs.length === 1) return refs[0];
  const dim = refs[0].length;
  const mean = new Float32Array(dim);
  for (const r of refs) {
    for (let i = 0; i < dim; i++) mean[i] += r[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= refs.length;
  return mean;
}

/**
 * NOMIN enrol guard: do the reference selfies agree they are the same person?
 * face-api uses Euclidean distance (lower = same). Same person is usually
 * < 0.4 apart; > 0.55 apart almost always means two different people mixed.
 */
export function refAgreement(refs: Float32Array[]): { min: number; mean: number; count: number } | null {
  if (!refs || refs.length < 2) return null;
  const dists: number[] = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      dists.push(euclidean(refs[i], refs[j]));
    }
  }
  if (dists.length === 0) return null;
  const min = Math.min(...dists);
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  return { min, mean, count: dists.length };
}

/** Score a single cached face list against references (shared by scan + requery). */
function bestDistanceForFaces(
  faces: FaceDescriptor[],
  references: Float32Array[],
  threshold: number
): { distance: number; faceSize: number } | null {
  let best: { distance: number; faceSize: number } | null = null;
  for (const f of faces) {
    if (f.score < MIN_DETECT_SCORE) continue;
    const bar = sizeAdjustedThreshold(f.size, threshold);
    for (const ref of references) {
      const dist = euclidean(ref, f.vec);
      if (dist <= bar && (!best || dist < best.distance)) {
        best = { distance: dist, faceSize: f.size };
      }
    }
  }
  return best;
}

/**
 * NOMIN `rethreshold`: tighten results instantly with no image work.
 * Only filters — loosening beyond the scan threshold needs a re-query/scan
 * because rejected photos were never added to `matches`.
 */
export function rethresholdMatches(matches: FaceMatch[], filterThreshold: number): FaceMatch[] {
  return matches
    .filter((m) => m.distance <= filterThreshold)
    .sort((a, b) => a.distance - b.distance);
}

/**
 * NOMIN `requery`: re-score the IndexedDB face index against (possibly new)
 * references with zero image downloads. Returns matches + coverage so the UI
 * can say "searched N stored faces in ~1s, M photos not indexed yet".
 */
export async function requeryIndex(opts: {
  references: Float32Array[];
  photos: DriveFile[];
  threshold?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ matches: FaceMatch[]; indexed: number; unindexed: number }> {
  const t = startTiming('gallery-requery-index');
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  const index = await loadIndex();
  const images = opts.photos.filter((p) => (p.mediaType ?? 'image') === 'image');
  const matches: FaceMatch[] = [];
  let indexed = 0;
  let unindexed = 0;
  let done = 0;
  for (const photo of images) {
    const faces = cachedDescriptors(photo, index);
    if (!faces) {
      unindexed += 1;
    } else {
      indexed += 1;
      const best = bestDistanceForFaces(faces, opts.references, threshold);
      if (best) matches.push({ photo, distance: best.distance, faceSize: best.faceSize });
    }
    done += 1;
    // Yield periodically so a huge gallery can't freeze the tab mid-re-query.
    if (done % 500 === 0) await new Promise((r) => setTimeout(r, 0));
    if (done % 100 === 0 || done === images.length) opts.onProgress?.(done, images.length);
  }
  matches.sort((a, b) => a.distance - b.distance);
  t.end({ indexed, unindexed, matches: matches.length });
  return { matches, indexed, unindexed };
}

/**
 * Export locally cached descriptor rows for sharing to the server index.
 * No image work — reads the IndexedDB snapshot only. Powers the
 * "contribute my index" button so one device's scan speeds up everyone's
 * fast search (server holds no models, only shared vectors).
 */
export async function getAllCachedDescriptors(
  photos: DriveFile[]
): Promise<{ photoId: string; modifiedTime: string; descriptors: number[][]; sizes: number[]; scores: number[] }[]> {
  const index = await loadIndex();
  const rows: { photoId: string; modifiedTime: string; descriptors: number[][]; sizes: number[]; scores: number[] }[] = [];
  for (const photo of photos) {
    const hit = getCached(photo.id, index);
    if (
      hit &&
      hit.modifiedTime === photo.modifiedTime &&
      Array.isArray(hit.descriptors) &&
      hit.descriptors.length > 0
    ) {
      rows.push({
        photoId: hit.photoId,
        modifiedTime: hit.modifiedTime,
        descriptors: hit.descriptors,
        sizes: Array.isArray(hit.sizes) ? hit.sizes : [],
        scores: Array.isArray(hit.scores) ? hit.scores : [],
      });
    }
  }
  return rows;
}

/** How many of these photos already have face vectors in the local index? */
export async function indexCoverage(photos: DriveFile[]): Promise<{ indexed: number; total: number }> {
  const index = await loadIndex();
  const images = photos.filter((p) => (p.mediaType ?? 'image') === 'image');
  let indexed = 0;
  for (const photo of images) {
    if (cachedDescriptors(photo, index)) indexed += 1;
  }
  return { indexed, total: images.length };
}

export interface PersonGroup {
  size: number;
  nFiles: number;
  faces: { photo: DriveFile; distance: number; faceSize: number }[];
  best: { photo: DriveFile; distance: number; faceSize: number };
}

/**
 * NOMIN `Everyone found` (light): greedy centroid grouping over the stored
 * index. Single pass — each face joins the closest group above `sim`, else
 * starts a new one. Groups smaller than `minGroup` are dropped.
 * NOTE: `sim` here is a Euclidean-distance ceiling (lower = stricter).
 */
export async function clusterIndex(
  photos: DriveFile[],
  sim: number = 0.45,
  minGroup: number = 2
): Promise<PersonGroup[]> {
  const index = await loadIndex();
  const images = photos.filter((p) => (p.mediaType ?? 'image') === 'image');
  type Item = { photo: DriveFile; vec: Float32Array; size: number };
  const items: Item[] = [];
  for (const photo of images) {
    const faces = cachedDescriptors(photo, index);
    if (!faces) continue;
    for (const f of faces) {
      if (f.score < MIN_DETECT_SCORE) continue;
      items.push({ photo, vec: f.vec, size: f.size });
      if (items.length >= 4000) break;
    }
    if (items.length >= 4000) break;
  }
  const centroids: Float32Array[] = [];
  const groups: Item[][] = [];
  for (const it of items) {
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < centroids.length; j++) {
      const d = euclidean(it.vec, centroids[j]);
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestD <= sim) {
      groups[bestJ].push(it);
      // Running mean update toward the new member.
      const c = centroids[bestJ];
      const n = groups[bestJ].length;
      for (let k = 0; k < c.length; k++) c[k] += (it.vec[k] - c[k]) / n;
    } else {
      centroids.push(new Float32Array(it.vec));
      groups.push([it]);
    }
  }
  const out: PersonGroup[] = [];
  for (const g of groups) {
    if (g.length < minGroup) continue;
    const files = new Set(g.map((x) => x.photo.id));
    // Most central face = representative thumbnail.
    const centroid = centroids[groups.indexOf(g)];
    const ranked = [...g].sort((a, b) => euclidean(a.vec, centroid) - euclidean(b.vec, centroid));
    const best = ranked[0];
    out.push({
      size: g.length,
      nFiles: files.size,
      faces: ranked.slice(0, 24).map((x) => ({
        photo: x.photo,
        distance: euclidean(x.vec, centroid),
        faceSize: x.size,
      })),
      best: { photo: best.photo, distance: 0, faceSize: best.size },
    });
  }
  out.sort((a, b) => b.size - a.size);
  return out.slice(0, 60);
}
