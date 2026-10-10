import { NextRequest, NextResponse } from 'next/server';
import { loadMemoryIndex, readMeta, upsertRows, type FaceRow } from '@/server/face/store';
import { faceConfig } from '@/server/face/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Shared vector index (NO server models — vectors come from visitors' browsers).
// GET  /api/face-index -> { memory:{faces,photos}, meta, nvidia }
// POST /api/face-index { rows:[{photoId, modifiedTime, descriptors, sizes?, scores?}] }
//   -> upserts vectors (client-assisted indexing: browsers share what they computed).
export async function GET() {
  try {
    const [mem, meta, nvidia] = await Promise.all([
      loadMemoryIndex().catch(() => ({ faces: 0, photos: 0, ms: 0 })),
      readMeta().catch(() => null),
      import('@/server/face/nvidia').then((m) => m.nvidiaStatus()).catch(() => null),
    ]);
    return NextResponse.json({ success: true, memory: mem, meta, nvidia });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'status failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { rows?: FaceRow[] } | null;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'rows (vector rows) is required.' }, { status: 400 });
    }
    if (rows.length > faceConfig.maxUploadRows) {
      return NextResponse.json(
        { success: false, error: `Too many rows per request (max ${faceConfig.maxUploadRows}). Send in chunks.` },
        { status: 400 }
      );
    }
    const out = await upsertRows(rows);
    const mem = await loadMemoryIndex(true).catch(() => ({ faces: 0, photos: 0, ms: 0 }));
    return NextResponse.json({ success: true, ...out, memory: mem });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'upload failed' }, { status: 500 });
  }
}
