import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { faceConfig } from '@/server/face/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Fast search (NO server models): the browser computes the selfie descriptor
// with the existing face-api feature and sends only the 128 numbers here.
// The server cosine/euclidean-searches the shared vector index in milliseconds
// and, when a selfie image is included, asks NVIDIA's vision model to
// double-check the top candidates (same-person verification).
//
// POST /api/face-search { descriptor:[128 numbers], topK?, threshold?,
//   consent: true, selfieDataUrl?: "data:image/..." (for AI check only) }
// -> { matches: [{photoId, distance, faceSize, thumb, verified?}], ms, ... }

interface CacheEntry {
  at: number;
  data: unknown;
}

const resultCache = new Map<string, CacheEntry>();
const CACHE_MS = faceConfig.resultCacheMinutes * 60 * 1000;

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const body = (await request.json().catch(() => null)) as {
      descriptor?: number[];
      topK?: number;
      threshold?: number;
      consent?: boolean;
      selfieDataUrl?: string;
    } | null;
    if (!body?.consent) {
      return NextResponse.json(
        { success: false, error: 'Consent is required. Please tick the consent checkbox — required because students may be minors.' },
        { status: 403 }
      );
    }
    const d = body.descriptor;
    if (!Array.isArray(d) || d.length < 32 || !d.every((v) => Number.isFinite(v))) {
      return NextResponse.json({ success: false, error: 'descriptor (face numbers) is required.' }, { status: 400 });
    }
    const threshold =
      typeof body.threshold === 'number' && Number.isFinite(body.threshold)
        ? Math.min(0.9, Math.max(0.2, body.threshold))
        : faceConfig.threshold;
    const topK = Math.max(1, Math.min(500, typeof body.topK === 'number' ? body.topK : 200));
    const query = new Float32Array(d);

    const key = crypto
      .createHash('sha1')
      .update(Buffer.from(query.buffer))
      .update(String(threshold))
      .update(String(topK))
      .digest('hex');
    const cached = resultCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json({ ...(cached.data as object), cached: true });
    }

    const tSearch0 = Date.now();
    const { loadMemoryIndex, searchMemory } = await import('@/server/face/store');
    const mem = await loadMemoryIndex().catch(() => ({ faces: 0, photos: 0, ms: 0 }));
    const hits = searchMemory(query, threshold, topK);
    const searchMs = Date.now() - tSearch0;

    // NVIDIA double-check on the top few (bounded count + time for serverless).
    let verifiedCount = 0;
    let verifyNote: string | null = null;
    const verified: Record<string, { same: boolean; confidence: number | null }> = {};
    if (body.selfieDataUrl && hits.length > 0) {
      try {
        const { nvidiaVerifySamePerson, nvidiaAvailable, nvidiaStatus } = await import('@/server/face/nvidia');
        if (nvidiaAvailable()) {
          const top = hits.slice(0, faceConfig.verifyTopN);
          const budget = Date.now() + 9000;
          // Small parallel batches so one slow check doesn't eat the budget.
          for (let i = 0; i < top.length && Date.now() < budget; i += 3) {
            const batch = top.slice(i, i + 3);
            const outs = await Promise.all(
              batch.map((h) => nvidiaVerifySamePerson(body.selfieDataUrl as string, h.photoId))
            );
            outs.forEach((r, j) => {
              if (!r) return; // undecided stays
              verified[batch[j].photoId] = r;
              if (r.same) verifiedCount += 1;
            });
          }
          const st = nvidiaStatus();
          if (st.lastError) verifyNote = st.lastError;
        } else {
          const st = (await import('@/server/face/nvidia')).nvidiaStatus();
          verifyNote = st.lastError ?? (st.configured ? 'NVIDIA cooling down — vector matches kept' : null);
        }
      } catch {
        // verification is best-effort; vector matches stand on their own
      }
    }

    // Drop NVIDIA-rejected candidates, keep undecided ones.
    const kept = hits.filter((h) => {
      const v = verified[h.photoId];
      return !v || v.same;
    });

    const matches = kept.map((h) => ({
      photoId: h.photoId,
      distance: Math.round(h.distance * 1000) / 1000,
      faceSize: h.faceSize,
      thumb: `/api/face-thumbs?id=${h.photoId}`,
      verified: verified[h.photoId]?.same === true,
    }));

    const payload = {
      success: true,
      matches,
      indexedFaces: mem.faces,
      indexedPhotos: mem.photos,
      verifiedCount,
      verifyNote,
      aiChecked: Object.keys(verified).length > 0,
      ms: Date.now() - t0,
      timings: { searchMs },
      threshold,
    };
    resultCache.set(key, { at: Date.now(), data: payload });
    if (resultCache.size > 50) {
      const all = Array.from(resultCache.entries());
      all.sort((a, b) => a[1].at - b[1].at);
      const oldest = all.length ? all[0][0] : null;
      if (oldest) resultCache.delete(oldest);
    }
    return NextResponse.json(payload);
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'search failed' }, { status: 500 });
  }
}
