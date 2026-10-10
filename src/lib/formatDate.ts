const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * "26 Sep, 2026" — matches the date style used on gurukul.org/events.
 * Built from an explicit month table rather than toLocaleDateString, which
 * renders "Sept" under en-IN and can differ between server and client.
 */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
}

/** Indian academic year runs June → May, so Jun 2026 belongs to 2026-27. */
export function academicYearOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 5 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}
