/** A Google Drive id is 25+ chars of URL-safe base64-ish text. */
const ID_RE = /^[A-Za-z0-9_-]{15,}$/;

export interface ParsedDriveLink {
  id: string;
  kind: 'folder' | 'file' | 'unknown';
}

/**
 * Pulls the id out of whatever someone pastes — the share dialog, the address
 * bar, or just the bare id. Handles the "/drive/u/0/folders/..." variant that
 * signed-in users copy, which is the one people most often get wrong.
 */
export function parseDriveLink(input: string): ParsedDriveLink | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  // Bare id pasted on its own.
  if (ID_RE.test(raw) && !raw.includes('/')) return { id: raw, kind: 'unknown' };

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;

  const path = url.pathname;

  const folder = path.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folder) return { id: folder[1], kind: 'folder' };

  const file = path.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (file) return { id: file[1], kind: 'file' };

  const idParam = url.searchParams.get('id');
  if (idParam && ID_RE.test(idParam)) return { id: idParam, kind: 'unknown' };

  const dPath = path.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (dPath) return { id: dPath[1], kind: 'unknown' };

  return null;
}
