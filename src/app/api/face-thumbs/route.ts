import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Small (300px) thumbnails, pre-generated at index time when disk is writable.
// Falls back to the existing /api/thumb proxy so grids never break on Vercel.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return new NextResponse('Missing id', { status: 400 });
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '_');
  try {
    const p = path.join(process.cwd(), 'public', 'face-thumbs', `${safe}.jpg`);
    if (fs.existsSync(p)) {
      const bytes = fs.readFileSync(p);
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    }
  } catch {
    // fall through to proxy
  }
  const proxied = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w300`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  }).catch(() => null);
  const ct = proxied?.headers.get('content-type') || '';
  if (proxied?.ok && ct.startsWith('image/') && proxied.body) {
    return new NextResponse(proxied.body, {
      status: 200,
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
    });
  }
  return new NextResponse('Thumbnail unavailable', { status: 404 });
}
