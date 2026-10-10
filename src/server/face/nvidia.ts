// NVIDIA visual verification — the ONLY server-side model (no local models).
// Uses an NVIDIA-hosted vision-language model through the OpenAI-compatible
// chat API to double-check top candidates: "is the selfie person in this
// photo?" Key ONLY from NVIDIA_API_KEY env var, server side, never committed.
// On ANY failure (quota over / rate-limit / timeout / 404) returns null and
// the caller keeps the vector match as-is (undecided stays).

import { faceConfig } from './config';

const CHAT_URL =
  process.env.NVIDIA_CHAT_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
const VISION_MODEL =
  process.env.NVIDIA_VISION_MODEL ?? 'meta/llama-3.2-90b-vision-instruct';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

let consecutiveFailures = 0;
let cooldownUntil = 0;
let lastError: string | null = null;
let lastOkAt: string | null = null;

export function nvidiaConfigured(): boolean {
  return !!(process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.trim());
}

export function nvidiaAvailable(): boolean {
  if (!nvidiaConfigured()) return false;
  if (Date.now() < cooldownUntil) return false;
  return true;
}

export function nvidiaStatus(): {
  configured: boolean;
  available: boolean;
  model: string;
  consecutiveFailures: number;
  lastError: string | null;
  lastOkAt: string | null;
  inCooldownUntil: string | null;
} {
  return {
    configured: nvidiaConfigured(),
    available: nvidiaAvailable(),
    model: VISION_MODEL,
    consecutiveFailures,
    lastError,
    lastOkAt,
    inCooldownUntil: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
  };
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  cooldownUntil = 0;
  lastError = null;
  lastOkAt = new Date().toISOString();
}

function recordFailure(reason: string): void {
  lastError = reason;
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
  }
}

async function driveThumbDataUrl(photoId: string, timeoutMs = 12000): Promise<string | null> {
  const candidates = [
    `https://drive.google.com/thumbnail?id=${photoId}&sz=w800`,
    `https://lh3.googleusercontent.com/d/${photoId}=w800`,
  ];
  for (const url of candidates) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.startsWith('image/')) {
        const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
        clearTimeout(timer);
        return `data:${ct};base64,${b64}`;
      }
    } catch {
      // try next candidate
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export interface VerifyResult {
  same: boolean;
  confidence: number | null;
}

/**
 * Ask NVIDIA VLM whether the selfie person is clearly visible in the photo.
 * Returns null when undecided (no key, quota over, timeout, unclear answer).
 */
export async function nvidiaVerifySamePerson(
  selfieDataUrl: string,
  photoId: string,
  timeoutMs = 25000
): Promise<VerifyResult | null> {
  if (!nvidiaAvailable()) return null;
  const key = process.env.NVIDIA_API_KEY!.trim();
  const candidateDataUrl = await driveThumbDataUrl(photoId);
  if (!candidateDataUrl) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, faceConfig.nvidiaTimeoutMs * 10));
  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Two photos. Photo 1 is a selfie of one person. Is that SAME person clearly visible in photo 2? Reply with ONLY valid JSON, no other text: {"same": true or false, "confidence": 0 to 100}.',
              },
              { type: 'image_url', image_url: { url: selfieDataUrl } },
              { type: 'image_url', image_url: { url: candidateDataUrl } },
            ],
          },
        ],
        max_tokens: 60,
        temperature: 0,
      }),
    });
    if (res.status === 402) {
      recordFailure('NVIDIA usage/quota is over — vector matches kept as-is');
      return null;
    }
    if (res.status === 429) {
      recordFailure('NVIDIA rate limit hit — vector matches kept as-is');
      return null;
    }
    if (res.status === 401) {
      recordFailure('NVIDIA key rejected — vector matches kept as-is');
      return null;
    }
    if (res.status === 404) {
      recordFailure('NVIDIA model/endpoint not found — vector matches kept as-is');
      return null;
    }
    if (!res.ok) {
      recordFailure(`NVIDIA HTTP ${res.status} — vector matches kept as-is`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const m = text.match(/\{[^}]*\}/);
    if (!m) return null; // unclear answer -> undecided stays
    const parsed = JSON.parse(m[0]) as { same?: unknown; confidence?: unknown };
    recordSuccess();
    return {
      same: parsed.same === true,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    };
  } catch (e: unknown) {
    const aborted = (e as Error)?.name === 'AbortError';
    recordFailure(aborted ? 'NVIDIA verify timed out — vector matches kept as-is' : 'NVIDIA unreachable — vector matches kept as-is');
    return null;
  } finally {
    clearTimeout(timer);
  }
}
