import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Same-origin thumbnail proxy for face scanning (and anywhere else that needs
// canvas-safe pixels). Drive thumbnails are ~20–50 KB vs multi-MB originals,
// which makes gallery-wide face scanning 10–30x faster. Responses are real
// image bytes with no CORS taint, unlike hot-linking Google hosts directly.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');
    let sz = searchParams.get('sz') || 'w500';
    if (!/^w\d{2,4}$/.test(sz)) sz = 'w500';

    if (!fileId) {
      return new NextResponse('Missing file ID', { status: 400 });
    }

    const width = sz.slice(1);
    const candidates = [
      `https://drive.google.com/thumbnail?id=${fileId}&sz=${sz}`,
      `https://lh3.googleusercontent.com/d/${fileId}=w${width}`,
    ];

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          redirect: 'follow',
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.startsWith('image/') && res.body) {
          return new NextResponse(res.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
            },
          });
        }
      } catch {
        // try next candidate
      }
    }

    return new NextResponse('Thumbnail unavailable', { status: 404 });
  } catch (error: any) {
    return new NextResponse(error?.message || 'Thumbnail failed', { status: 500 });
  }
}
