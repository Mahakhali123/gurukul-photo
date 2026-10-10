// Tiny stage timer shared by client face-search and server face pipeline.
// Zero dependencies, no logic change — just measurements.
// Usage:
//   const t = startTiming('selfie-detect');
//   ... work ...
//   t.end({ faces: 3 }); // console.debug('[face-timing] selfie-detect 123ms {faces:3}')
//   const summary = t.ms();

type TimingMeta = Record<string, string | number | boolean | null | undefined>;

interface TimingHandle {
  ms: () => number;
  end: (meta?: TimingMeta, log?: boolean) => number;
}

const ENABLED =
  typeof process !== 'undefined' && process.env
    ? process.env.FACE_TIMING !== 'off'
    : true;

export function startTiming(stage: string): TimingHandle {
  const t0 =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  return {
    ms: () => {
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      return Math.round((now - t0) * 10) / 10;
    },
    end: (meta, log = true) => {
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      const ms = Math.round((now - t0) * 10) / 10;
      if (log && ENABLED) {
        try {
          const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
          // eslint-disable-next-line no-console
          console.debug(`[face-timing] ${stage} ${ms}ms${suffix}`);
        } catch {
          // never break search for logging
        }
      }
      return ms;
    },
  };
}

/** POST a timing batch to /api/face-metrics (fire-and-forget, client only). */
export function reportTimings(entries: { stage: string; ms: number; meta?: TimingMeta }[]): void {
  try {
    if (typeof fetch === 'undefined' || typeof window === 'undefined') return;
    const body = JSON.stringify({ entries, at: new Date().toISOString() });
    // keepalive so it survives page transitions; ignore failures
    void fetch('/api/face-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
