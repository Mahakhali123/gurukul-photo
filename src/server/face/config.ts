// Server-side fast face-search config. All tunables in one place.
// The server holds NO ML models (Vercel-safe): matching runs on face-api
// vectors computed in the browser; NVIDIA's vision model only double-checks.
// Env overrides (server only — never expose keys to the client):
//   FACE_THRESHOLD (default 0.55, Euclidean — same scale as the app slider),
//   NVIDIA_API_KEY (server only), NVIDIA_VISION_MODEL, FACE_INDEX_DIR

export const faceConfig = {
  /** Euclidean match bar (same scale as the UI slider). */
  threshold: clampNum(Number(process.env.FACE_THRESHOLD ?? 0.55), 0.2, 0.9, 0.55),
  /** Per-call NVIDIA budget base (verify calls may use up to 10x). */
  nvidiaTimeoutMs: 2000,
  /** Max candidates the NVIDIA check runs per search (keeps Hobby under 10s). */
  verifyTopN: 5,
  /** Where the JSONL index + meta live. Persistent on localhost; per-instance
   *  (ephemeral) on Vercel serverless — the browser scan always works as fallback. */
  indexDir: process.env.FACE_INDEX_DIR ?? 'data/face-index',
  /** Result cache TTL for identical selfie descriptor (minutes). */
  resultCacheMinutes: 5,
  /** Max descriptor rows accepted per index-upload request. */
  maxUploadRows: 500,
} as const;

function clampNum(v: number, lo: number, hi: number, fb: number): number {
  if (!Number.isFinite(v)) return fb;
  return Math.min(hi, Math.max(lo, v));
}
