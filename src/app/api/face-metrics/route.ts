import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Client stage timings (from faceTimings.ts) land here for the audit.
// In-memory ring buffer; GET returns recent batches for before/after comparison.
interface Entry {
  stage: string;
  ms: number;
  meta?: Record<string, string | number | boolean | null | undefined>;
}
const recent: { at: string; entries: Entry[] }[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { entries?: Entry[] } | null;
    if (body?.entries?.length) {
      recent.push({ at: new Date().toISOString(), entries: body.entries.slice(0, 50) });
      if (recent.length > 100) recent.splice(0, recent.length - 100);
      // Server log line keeps localhost_run/dev logs greppable.
      // eslint-disable-next-line no-console
      console.debug(`[face-timing-client] ${body.entries.map((e) => `${e.stage}=${e.ms}ms`).join(' ')}`);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}

export async function GET() {
  return NextResponse.json({ success: true, batches: recent.slice(-20) });
}
