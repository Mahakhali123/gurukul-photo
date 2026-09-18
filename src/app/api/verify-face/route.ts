import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// On-demand AI double-check for face-search matches.
// The browser does the fast vector matching; this route only re-verifies a
// handful of top candidates through an OpenRouter vision model to weed out
// lookalikes. Key resolution: env var first, local gitignored file second.
function getOpenRouterKey(): string | null {
  if (process.env.OPENROUTER_API_KEY?.trim()) return process.env.OPENROUTER_API_KEY.trim();
  if (process.env.FACE_VERIFY_MODEL?.trim() === 'disabled') return null;
  try {
    const p = join(process.cwd(), '.openrouter-key');
    if (existsSync(p)) {
      const key = readFileSync(p, 'utf8').trim();
      return key || null;
    }
  } catch {
    // fall through
  }
  return null;
}

async function driveThumbBytes(fileId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const candidates = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
    `https://lh3.googleusercontent.com/d/${fileId}=w800`,
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
      if (res.ok && contentType.startsWith('image/')) {
        return { bytes: await res.arrayBuffer(), contentType };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64');
}

export async function POST(request: NextRequest) {
  const key = getOpenRouterKey();
  if (!key) {
    return NextResponse.json(
      { success: false, error: 'AI verify is not configured on this server.' },
      { status: 503 }
    );
  }

  let body: { referenceDataUrl?: string; photoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const { referenceDataUrl, photoId } = body;
  if (!referenceDataUrl || !photoId) {
    return NextResponse.json({ success: false, error: 'referenceDataUrl and photoId are required.' }, { status: 400 });
  }

  const candidate = await driveThumbBytes(photoId);
  if (!candidate) {
    return NextResponse.json({ success: false, error: 'Could not fetch that photo for verification.' }, { status: 502 });
  }

  const model = process.env.FACE_VERIFY_MODEL?.trim() || 'qwen/qwen-2.5-vl-72b-instruct';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gurukul-gallery.local',
        'X-Title': 'Gurukul Gallery Face Verify',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Two photos. Photo 1 is a selfie of one person. Is that SAME person clearly visible in photo 2? Reply with ONLY valid JSON, no other text: {"same": true or false, "confidence": 0 to 100}.',
              },
              { type: 'image_url', image_url: { url: referenceDataUrl } },
              {
                type: 'image_url',
                image_url: { url: `data:${candidate.contentType};base64,${bufferToBase64(candidate.bytes)}` },
              },
            ],
          },
        ],
        max_tokens: 60,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      return NextResponse.json({ success: false, error: 'AI key was rejected — it may be expired or revoked.' }, { status: 502 });
    }
    if (res.status === 402) {
      return NextResponse.json({ success: false, error: 'AI account is out of credits.' }, { status: 502 });
    }
    if (res.status === 429) {
      return NextResponse.json({ success: false, error: 'AI is rate-limited right now — try again in a minute.' }, { status: 502 });
    }
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'AI verification failed. Please try again.' }, { status: 502 });
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[^}]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: 'AI gave an unclear answer. Please try again.' }, { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      success: true,
      same: parsed.same === true,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'AI verification timed out. Please try again.' }, { status: 504 });
    }
    return NextResponse.json({ success: false, error: 'AI verification failed. Please try again.' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
