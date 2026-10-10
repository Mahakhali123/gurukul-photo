import { NextRequest, NextResponse } from 'next/server';
import { parseDriveLink } from '@/lib/driveLink';
import {
  listExtraFolders,
  listBlockedFolders,
  removeExtraFolder,
  blockFolder,
  unblockFolder,
  envStrings,
} from '@/lib/extraFolders';
import { syncDriveNow, DEFAULT_FOLDER_ID, getDriveAlbums } from '@/lib/drive';
import { probeDriveFolder } from '@/lib/driveProbe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Admin endpoint: list, remove and block. Kept separate from the public upload
 * route so the upload page has no way to undo anything.
 *
 * NOTE: this is unlisted, not authenticated — anyone who knows the URL can call
 * it. Put it behind a shared secret before handing the link out widely.
 */

// Removal and blocking never wait on a crawl; the cache is
// stale-while-revalidate, so the gallery catches up on its own.
function refreshInBackground(action: string) {
  void syncDriveNow().catch((err) => {
    console.error(`Post-${action} Drive sync failed:`, err?.message || err);
  });
}

export async function GET() {
  let albums: { id: string; name: string }[] = [];
  try {
    albums = (await getDriveAlbums()).map((a) => ({ id: a.id, name: a.name }));
  } catch {
    // The lists below are still useful without the album picker.
  }
  return NextResponse.json({
    success: true,
    data: {
      folders: listExtraFolders(),
      blocked: listBlockedFolders(),
      albums,
      rootFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID,
      env: envStrings(),
    },
  });
}

/** Block a folder by link or id. */
export async function POST(request: NextRequest) {
  try {
    const { link, id: rawId, label } = await request.json();
    const id = rawId ? String(rawId) : parseDriveLink(String(link || ''))?.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Paste a Drive folder link or an album id to block.' },
        { status: 400 }
      );
    }

    // Name it if Drive will tell us, but block regardless — the whole point is
    // to be able to block something unreachable or already removed.
    let name = label || id;
    if (!label) {
      const probe = await probeDriveFolder(id);
      if (probe.ok && probe.name) name = probe.name;
    }

    const { blocked, persisted } = blockFolder(id, name);
    if (blocked) refreshInBackground('block');

    return NextResponse.json({
      success: true,
      message: blocked ? `Blocked "${name}".` : `"${name}" was already blocked.`,
      data: { folders: listExtraFolders(), blocked: listBlockedFolders(), env: envStrings(), persisted },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Could not block that folder.' },
      { status: 500 }
    );
  }
}

/** Remove an uploaded folder, or unblock a blocked one. */
export async function DELETE(request: NextRequest) {
  try {
    const { id, action } = await request.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing folder id.' }, { status: 400 });
    }

    if (action === 'unblock') {
      const res = unblockFolder(String(id));
      if (!res.unblocked) {
        return NextResponse.json({ success: false, error: res.reason }, { status: 400 });
      }
      refreshInBackground('unblock');
      return NextResponse.json({
        success: true,
        message: 'Unblocked.',
        data: { folders: listExtraFolders(), blocked: listBlockedFolders(), env: envStrings() },
      });
    }

    const res = removeExtraFolder(String(id));
    if (!res.removed) {
      return NextResponse.json({ success: false, error: res.reason }, { status: 400 });
    }
    refreshInBackground('remove');
    return NextResponse.json({
      success: true,
      message: 'Removed from the gallery.',
      data: { folders: listExtraFolders(), blocked: listBlockedFolders(), env: envStrings() },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Could not complete that change.' },
      { status: 500 }
    );
  }
}
