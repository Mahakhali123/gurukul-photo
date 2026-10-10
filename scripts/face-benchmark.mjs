// Face-search verification: 10 known students, speed p50/p95 + precision/recall.
// Space: 128-d face-api-style descriptors, Euclidean distance (same as the app).
// Two modes:
//   1. synthetic (default): noisy identity vectors; matrix-search speed + curves.
//   2. live: --live --descriptor <json-file> hits /api/face-search with a vector.
//      (Descriptors come from the browser; save one via the modal's timing log
//      or construct from a scan. No server models involved.)
// Usage:
//   node scripts/face-benchmark.mjs
//   node scripts/face-benchmark.mjs --live --base http://localhost:2000 --descriptor ./vec.json --thresholds 0.45,0.55,0.65
import fs from 'fs';

function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// face-api descriptors are NOT unit-norm; model them as N(0,1) raw.
function randVec(dim) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = randn();
  return v;
}
function noisyCopy(v, noise) {
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] + randn() * noise;
  return o;
}
function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}
function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function synthetic() {
  const DIM = 128, STUDENTS = 10, DISTRACTORS = 2000;
  // Calibrated so same-person lands ~0.3-0.5 and strangers ~0.9+ (face-api-like).
  const identities = Array.from({ length: STUDENTS }, () => randVec(DIM));
  const gallery = [];
  identities.forEach((id, s) => {
    for (let i = 0; i < 20; i++) gallery.push({ student: s, vec: noisyCopy(id, 0.025), hard: false });
    for (let i = 0; i < 10; i++) gallery.push({ student: s, vec: noisyCopy(id, 0.045), hard: true });
    // Doppelgangers: near THIS identity but labelled stranger (tests precision).
    for (let i = 0; i < 5; i++) gallery.push({ student: -1, vec: noisyCopy(id, 0.05), hard: true });
  });
  for (let i = 0; i < DISTRACTORS; i++) gallery.push({ student: -1, vec: randVec(DIM), hard: false });

  const thresholds = [0.45, 0.55, 0.65];
  const searchTimes = [];
  const perThreshold = {};
  for (const t of thresholds) perThreshold[t] = { tp: 0, fp: 0, fn: 0 };

  for (let s = 0; s < STUDENTS; s++) {
    const selfie = noisyCopy(identities[s], 0.03);
    const t0 = performance.now();
    const scored = gallery.map((g, idx) => ({ idx, dist: euclidean(selfie, g.vec) }));
    scored.sort((a, b) => a.dist - b.dist);
    searchTimes.push(performance.now() - t0);
    for (const t of thresholds) {
      const hits = scored.filter((x) => x.dist <= t).slice(0, 200);
      const tp = hits.filter((x) => gallery[x.idx].student === s).length;
      const fp = hits.length - tp;
      perThreshold[t].tp += tp;
      perThreshold[t].fp += fp;
      perThreshold[t].fn += 30 - tp;
    }
  }
  console.log(`synthetic: ${STUDENTS} students, gallery=${gallery.length} faces, dim=${DIM} euclidean`);
  console.log(`search time: p50=${pct(searchTimes, 50).toFixed(2)}ms p95=${pct(searchTimes, 95).toFixed(2)}ms`);
  for (const t of thresholds) {
    const { tp, fp, fn } = perThreshold[t];
    const prec = tp + fp ? tp / (tp + fp) : 1;
    const rec = tp + fn ? tp / (tp + fn) : 0;
    console.log(`threshold ${t.toFixed(2)}: precision=${prec.toFixed(3)} recall=${rec.toFixed(3)} (tp=${tp} fp=${fp} fn=${fn})`);
  }
}

async function live(opts) {
  const vec = JSON.parse(fs.readFileSync(opts.descriptor, 'utf8'));
  const times = [];
  for (const t of opts.thresholds) {
    const t0 = performance.now();
    const res = await fetch(`${opts.base}/api/face-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: vec.descriptor ?? vec, consent: true, threshold: t, topK: 100 }),
    });
    const dt = performance.now() - t0;
    times.push(dt);
    const json = await res.json().catch(() => ({}));
    console.log(`threshold ${t}: http=${res.status} ms=${dt.toFixed(0)} matches=${json.matches?.length ?? '-'} aiChecked=${json.aiChecked ?? '-'} err=${json.error ?? ''}`);
  }
  console.log(`live search: p50=${pct(times, 50).toFixed(0)}ms p95=${pct(times, 95).toFixed(0)}ms`);
}

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { live: a.includes('--live'), base: 'http://localhost:2000', descriptor: null, thresholds: [0.45, 0.55, 0.65] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--base') o.base = a[++i];
    if (a[i] === '--descriptor') o.descriptor = a[++i];
    if (a[i] === '--thresholds') o.thresholds = a[++i].split(',').map(Number);
  }
  return o;
}

const opts = parseArgs();
if (opts.live) {
  if (!opts.descriptor) { console.error('need --descriptor <json file with 128 numbers>'); process.exit(1); }
  await live(opts);
} else {
  await synthetic();
}
