import { NextRequest, NextResponse } from 'next/server';
import { deletePhotoRows, logFeedback } from '@/server/face/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/face-feedback { photoId, score?, verdict: 'not-me'|'correct' } — collects accuracy feedback.
// DELETE /api/face-feedback?photoId=... — deletes a student's embeddings (privacy: right to erasure).
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      photoId?: string;
      score?: number;
      verdict?: string;
    } | null;
    if (!body?.photoId) return NextResponse.json({ success: false, error: 'photoId required' }, { status: 400 });
    await logFeedback({ photoId: body.photoId, score: body.score ?? null, verdict: body.verdict ?? 'not-me' });
    return NextResponse.json({ success: true, note: 'Thanks — this helps tune the threshold.' });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get('photoId');
    if (!photoId) return NextResponse.json({ success: false, error: 'photoId required' }, { status: 400 });
    const out = await deletePhotoRows(photoId);
    await logFeedback({ photoId, verdict: 'deleted' });
    return NextResponse.json({ success: true, removed: out.removed });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
