// Face-search engine: runs 100% in the visitor's browser, no API key needed.
// Uses @vladmandic/face-api (TinyFaceDetector + 68 landmarks + recognition net)
// with models served from /public/models. Gallery images are loaded through
// the same-origin /api/download proxy so the canvas never gets tainted.
// Descriptors are cached in IndexedDB so repeat scans are near-instant.

import type { DriveFile } from '@/types';

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
const MAX_SCAN_DIM = 800; // downscale huge Drive photos before detection
const SCAN_CONCURRENCY = 6; // thumbnails are tiny, so more parallel workers are fine

let faceapiPromise: Promise<FaceApi> | null = null;
let modelsLoaded = false;

async function getFaceApi(): Promise<FaceApi> {
  if (!faceapiPromise) {
    faceapiPromise = import('@vladmandic/face-api');
  }
  return faceapiPromise;
}

export async function ensureFaceModels(onStatus?: (msg: string) => void): Promise<void> {
  if (modelsLoaded) return;
  const faceapi = await getFaceApi();
  onStatus?.('Loading face models… (one-time, ~7 MB)');
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  onStatus?.('Loading face models… (1/3)');
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  onStatus?.('Loading face models… (2/3)');
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  onStatus?.('Loading face models… (3/3)');
  modelsLoaded = true;
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
  return `/api/thumb?id=${photo.id}&sz=w1000`;
}

/** Full-file fallback for the rare photo with no Drive thumbnail. */
function fullImageUrl(photo: DriveFile): string {
  return `/api/download?id=${photo.id}&name=${encodeURIComponent(photo.name)}&mode=stream`;
}

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

// Multi-pass detection: large inputSize catches small faces, lower thresholds
// catch turned/side/hard faces. First non-empty pass wins. Gallery photos get
// the same thorough passes as selfies — a missed detection means a missed photo,
// so gallery scanning must NOT use a single strict pass.
async function detectFaces(
  faceapi: FaceApi,
  canvas: HTMLCanvasElement,
  profile: DetectProfile
): Promise<FullDetection[]> {
  const passes =
    profile === 'selfie'
      ? [
          { inputSize: 512, scoreThreshold: 0.3 },
          { inputSize: 416, scoreThreshold: 0.25 },
          { inputSize: 320, scoreThreshold: 0.2 },
        ]
      : [
          { inputSize: 512, scoreThreshold: 0.3 },
          { inputSize: 416, scoreThreshold: 0.25 },
          { inputSize: 320, scoreThreshold: 0.2 },
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
  const faceapi = await getFaceApi();
  await ensureFaceModels();
  const previewUrl = URL.createObjectURL(file);
  const img = await loadImageElement(previewUrl);
  try {
    const canvas = toWorkCanvas(img, 1024);
    const detections = await detectFaces(faceapi, canvas, 'selfie');
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
      const req = indexedDB.open('gurukul-face-cache-v5', 1);
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

async function getCached(photoId: string): Promise<CachedEntry | null> {
  try {
    const db = await openCacheDB();
    return await new Promise((resolve) => {
      const tx = db.transaction('descriptors', 'readonly');
      const req = tx.objectStore('descriptors').get(photoId);
      req.onsuccess = () => resolve((req.result as CachedEntry) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCached(entry: CachedEntry): Promise<void> {
  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('descriptors', 'readwrite');
      tx.objectStore('descriptors').put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Cache is best-effort; scanning still works without it.
  }
}

export async function clearFaceCache(): Promise<void> {
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

/** Minimum detector confidence for a face to count. Detection passes run with
 *  low thresholds to FIND weak faces, but only boxes at/above this score are
 *  trustworthy enough to match — below it the box is more likely a garland,
 *  statue, or background pattern than a real face. */
const MIN_DETECT_SCORE = 0.35;

async function cachedDescriptors(photo: DriveFile): Promise<FaceDescriptor[] | null> {
  const hit = await getCached(photo.id);
  if (hit && hit.modifiedTime === photo.modifiedTime && Array.isArray(hit.descriptors)) {
    return hit.descriptors.map((d, i) => ({
      vec: new Float32Array(d),
      size: Array.isArray(hit.sizes) && typeof hit.sizes[i] === 'number' ? hit.sizes[i] : 80,
      score: Array.isArray(hit.scores) && typeof hit.scores[i] === 'number' ? hit.scores[i] : 1,
    }));
  }
  return null;
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
  const faceapi = await getFaceApi();
  await ensureFaceModels();
  if (!opts.references || opts.references.length === 0) {
    throw new Error('No reference face provided');
  }
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
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

  async function scanOne(photo: DriveFile): Promise<void> {
    checkAborted();
    try {
      let faces = await cachedDescriptors(photo);
      if (!faces) {
        const img = await loadScannableImage(photo);
        try {
          checkAborted();
          const canvas = toWorkCanvas(img);
          const detections = await detectFaces(faceapi, canvas, 'gallery');
          // Keep small faces too (group photos) — score gate + size gating at
          // match time decide how strictly each one must match.
          faces = detections
            .filter((d) => d.detection.box.width >= MIN_GALLERY_FACE_SIZE && d.detection.box.height >= MIN_GALLERY_FACE_SIZE)
            .map((d) => ({
              vec: d.descriptor,
              size: Math.min(d.detection.box.width, d.detection.box.height),
              score: d.detection.score,
            }));
        } finally {
          img.src = '';
        }
        await setCached({
          photoId: photo.id,
          modifiedTime: photo.modifiedTime,
          descriptors: faces.map((f) => Array.from(f.vec)),
          sizes: faces.map((f) => f.size),
          scores: faces.map((f) => f.score),
        });
      }
      // Best (face, reference) pair wins; each face is judged against the
      // threshold adjusted for ITS size, and weak detector boxes are ignored.
      let best: FaceMatch | null = null;
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
      // SECOND OPINION at full resolution: a true face matches as well or
      // better with more pixels; a garbage collision (decoration, stranger,
      // blur artifact) collapses. Only confirmed photos are ever shown.
      if (best && !(await confirmAtFullRes(best))) {
        best = null;
      }
      if (best) {
        matches.push(best);
        opts.onMatch?.(best);
      }
    } catch {
      // One bad file (deleted, corrupt, no bytes) must never kill the scan.
    } finally {
      done += 1;
      opts.onProgress?.(done, total, matches.length);
    }
  }

  /**
   * Re-checks a thumbnail candidate against the full-resolution file. True
   * faces confirm (more pixels = same-or-better match); false alarms don't.
   * If the full file can't be loaded (e.g. HEIC on non-Safari), the candidate
   * stays (undecided, not rejected).
   */
  async function confirmAtFullRes(candidate: FaceMatch): Promise<boolean> {
    try {
      checkAborted();
      const img = await loadImageElement(fullImageUrl(candidate.photo));
      try {
        checkAborted();
        const canvas = toWorkCanvas(img, 1024);
        const detections = await detectFaces(faceapi, canvas, 'gallery');
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
        img.src = '';
      }
    } catch {
      return true; // couldn't load full file — keep, don't punish
    }
  }

  async function worker(): Promise<void> {    while (true) {
      checkAborted();
      const next = cursor;
      cursor += 1;
      if (next >= images.length) return;
      await scanOne(images[next]);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(SCAN_CONCURRENCY, images.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  matches.sort((a, b) => a.distance - b.distance);
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
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  const images = opts.photos.filter((p) => (p.mediaType ?? 'image') === 'image');
  const matches: FaceMatch[] = [];
  let indexed = 0;
  let unindexed = 0;
  let done = 0;
  for (const photo of images) {
    const faces = await cachedDescriptors(photo);
    if (!faces) {
      unindexed += 1;
    } else {
      indexed += 1;
      const best = bestDistanceForFaces(faces, opts.references, threshold);
      if (best) matches.push({ photo, distance: best.distance, faceSize: best.faceSize });
    }
    done += 1;
    if (done % 25 === 0 || done === images.length) opts.onProgress?.(done, images.length);
  }
  matches.sort((a, b) => a.distance - b.distance);
  return { matches, indexed, unindexed };
}

/** How many of these photos already have face vectors in the local index? */
export async function indexCoverage(photos: DriveFile[]): Promise<{ indexed: number; total: number }> {
  const images = photos.filter((p) => (p.mediaType ?? 'image') === 'image');
  let indexed = 0;
  // Probe in small batches so the UI stays responsive on huge galleries.
  for (let i = 0; i < images.length; i += 20) {
    const batch = images.slice(i, i + 20);
    const hits = await Promise.all(batch.map((p) => cachedDescriptors(p)));
    indexed += hits.filter(Boolean).length;
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
  const images = photos.filter((p) => (p.mediaType ?? 'image') === 'image');
  type Item = { photo: DriveFile; vec: Float32Array; size: number };
  const items: Item[] = [];
  for (const photo of images) {
    const faces = await cachedDescriptors(photo);
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
