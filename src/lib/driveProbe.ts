/**
 * Confirms a folder is actually reachable without credentials.
 *
 * A link shared as "Restricted" resolves fine in the owner's own browser but
 * returns nothing to the server, which would otherwise surface much later as a
 * silently empty album.
 */
export async function probeDriveFolder(
  id: string
): Promise<{ ok: boolean; name?: string; reason?: string }> {
  const key = process.env.GOOGLE_DRIVE_API_KEY || 'AIzaSyAWGrfCCr7albM3lmCc937gx4uIphbpeKQ';
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType&supportsAllDrives=true&key=${key}`,
      { cache: 'no-store' }
    );
    if (res.status === 404) {
      return { ok: false, reason: 'Folder not found. Check the link is correct.' };
    }
    if (res.status === 403) {
      return {
        ok: false,
        reason: 'Google refused access. Set the folder to "Anyone with the link" and try again.',
      };
    }
    if (!res.ok) return { ok: false, reason: `Google Drive responded ${res.status}.` };
    const data = await res.json();
    if (data.mimeType && data.mimeType !== 'application/vnd.google-apps.folder') {
      return { ok: false, reason: 'That link points to a single file. Please share the folder instead.' };
    }
    return { ok: true, name: data.name };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'Could not reach Google Drive.' };
  }
}
