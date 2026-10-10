// Shared face-vector index (server side, NO models here).
// Vectors are computed in the visitor's browser (existing face-api feature)
// and uploaded once; the server stores them and searches in milliseconds.
// Row (JSONL, one per detected face):
//   { photoId, modifiedTime, descriptors: [[128 floats]], sizes: [px], scores: [0..1] }
// Memory: plain array + linear Euclidean scan (thousands of faces = ms).
// Disk: data/face-index/ on localhost (persistent). On Vercel serverless the
// filesystem is per-instance/ephemeral — uploads still work within a warm
// instance, and the browser scan is always the fallback.

import fs from 'fs';
import path from 'path';
import { faceConfig } from './config';

export interface FaceRow {
  photoId: string;
  modifiedTime: string;
  descriptors: number[][];
  sizes?: number[];
  scores?: number[];
}

export interface FaceMeta {
  version: 2;
  model: string;
  dim: number;
  updatedAt: string;
  photosIndexed: number;
  facesIndexed: number;
}

function indexPath(): string {
  return path.join(process.cwd(), faceConfig.indexDir, 'vectors.jsonl');
}
function metaPath(): string {
  return path.join(process.cwd(), faceConfig.indexDir, 'meta.json');
}
function feedbackPath(): string {
  return path.join(process.cwd(), faceConfig.indexDir, 'feedback.jsonl');
}

function ensureDir(): void {
  try {
    fs.mkdirSync(path.join(process.cwd(), faceConfig.indexDir), { recursive: true });
  } catch {
    // read-only fs (Vercel) — memory-only mode
  }
}

function validRow(r: unknown): r is FaceRow {
  const x = r as FaceRow;
  return (
    !!x &&
    typeof x.photoId === 'string' &&
    Array.isArray(x.descriptors) &&
    x.descriptors.every((d) => Array.isArray(d) && d.length >= 32 && d.every((v) => Number.isFinite(v)))
  );
}

/** photoId -> row (one row per photo; re-upload replaces). */
export async function readIndexMap(): Promise<Map<string, FaceRow>> {
  const map = new Map<string, FaceRow>();
  try {
    const p = indexPath();
    if (!fs.existsSync(p)) return map;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const row = JSON.parse(s) as FaceRow;
        if (validRow(row)) map.set(row.photoId, row);
      } catch {
        // skip corrupt line
      }
    }
  } catch {
    // no index yet
  }
  // Session-only uploads on read-only filesystems merge on top.
  for (const r of memoryRows) map.set(r.photoId, r);
  return map;
}

/** Insert or replace rows by photoId. */
export async function upsertRows(rows: FaceRow[]): Promise<{ persisted: boolean; upserted: number }> {
  if (rows.length === 0) return { persisted: true, upserted: 0 };
  const clean = rows.filter(validRow);
  if (clean.length === 0) return { persisted: true, upserted: 0 };
  ensureDir();
  try {
    const map = await readIndexMapFileOnly();
    for (const r of clean) map.set(r.photoId, r);
    const lines: string[] = [];
    map.forEach((r) => lines.push(JSON.stringify(r)));
    fs.writeFileSync(indexPath(), (lines.length ? lines.join('\n') + '\n' : ''), 'utf8');
    memoryLoaded = false; // force memory rebuild
    return { persisted: true, upserted: clean.length };
  } catch {
    for (const r of clean) {
      const i = memoryRows.findIndex((m) => m.photoId === r.photoId);
      if (i >= 0) memoryRows[i] = r;
      else memoryRows.push(r);
    }
    memoryLoaded = false;
    return { persisted: false, upserted: clean.length };
  }
}

async function readIndexMapFileOnly(): Promise<Map<string, FaceRow>> {
  const map = new Map<string, FaceRow>();
  try {
    const p = indexPath();
    if (!fs.existsSync(p)) return map;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const row = JSON.parse(s) as FaceRow;
        if (validRow(row)) map.set(row.photoId, row);
      } catch {
        // skip
      }
    }
  } catch {
    // ignore
  }
  return map;
}

export async function writeMeta(meta: FaceMeta): Promise<void> {
  ensureDir();
  try {
    fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 2), 'utf8');
  } catch {
    // ignore on read-only fs
  }
}

export async function readMeta(): Promise<FaceMeta | null> {
  try {
    const p = metaPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as FaceMeta;
  } catch {
    return null;
  }
}

// ---- In-memory search ----

export interface MemFace {
  photoId: string;
  vec: Float32Array;
  size: number;
  score: number;
}

let memFaces: MemFace[] = [];
let memoryRows: FaceRow[] = [];
let memoryLoaded = false;
let loadedAt = 0;

export async function loadMemoryIndex(force = false): Promise<{ faces: number; photos: number; ms: number }> {
  const t0 = Date.now();
  if (!force && memoryLoaded && Date.now() - loadedAt < 60_000 && memFaces.length > 0) {
    return { faces: memFaces.length, photos: new Set(memFaces.map((f) => f.photoId)).size, ms: 0 };
  }
  const map = await readIndexMap();
  const faces: MemFace[] = [];
  map.forEach((row) => {
    row.descriptors.forEach((d, i) => {
      faces.push({
        photoId: row.photoId,
        vec: new Float32Array(d),
        size: Array.isArray(row.sizes) && typeof row.sizes[i] === 'number' ? row.sizes[i] : 80,
        score: Array.isArray(row.scores) && typeof row.scores[i] === 'number' ? row.scores[i] : 1,
      });
    });
  });
  memFaces = faces;
  memoryLoaded = true;
  loadedAt = Date.now();
  const dim = faces.length ? faces[0].vec.length : 128;
  await writeMeta({
    version: 2,
    model: 'faceapi-128-euclidean',
    dim,
    updatedAt: new Date().toISOString(),
    photosIndexed: new Set(faces.map((f) => f.photoId)).size,
    facesIndexed: faces.length,
  }).catch(() => {});
  return { faces: faces.length, photos: new Set(faces.map((f) => f.photoId)).size, ms: Date.now() - t0 };
}

function euclidean(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Euclidean top-K over stored faces (lower = same person). Skips weak boxes. */
export function searchMemory(
  query: Float32Array,
  threshold: number,
  topK: number
): { photoId: string; distance: number; faceSize: number }[] {
  type Hit = { photoId: string; distance: number; faceSize: number };
  const bestByPhoto = new Map<string, Hit>();
  for (const f of memFaces) {
    if (f.vec.length !== query.length) continue;
    if (f.score < 0.35) continue;
    const dist = euclidean(query, f.vec);
    if (dist > threshold) continue;
    const cur = bestByPhoto.get(f.photoId);
    if (!cur || dist < cur.distance) {
      bestByPhoto.set(f.photoId, { photoId: f.photoId, distance: dist, faceSize: f.size });
    }
  }
  const hits = Array.from(bestByPhoto.values());
  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, Math.max(1, topK));
}

/** Delete all rows for a photo/student (privacy: right to erasure). */
export async function deletePhotoRows(photoId: string): Promise<{ removed: number; persisted: boolean }> {
  const map = await readIndexMapFileOnly();
  const removed = map.has(photoId) ? 1 : 0;
  map.delete(photoId);
  memoryRows = memoryRows.filter((r) => r.photoId !== photoId);
  memoryLoaded = false;
  ensureDir();
  try {
    const lines: string[] = [];
    map.forEach((r) => lines.push(JSON.stringify(r)));
    fs.writeFileSync(indexPath(), (lines.length ? lines.join('\n') + '\n' : ''), 'utf8');
    return { removed, persisted: true };
  } catch {
    return { removed, persisted: false };
  }
}

export async function logFeedback(entry: Record<string, unknown>): Promise<void> {
  ensureDir();
  try {
    fs.appendFileSync(feedbackPath(), JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n', 'utf8');
  } catch {
    // best-effort
  }
}
