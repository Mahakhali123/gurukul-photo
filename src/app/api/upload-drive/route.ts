import { NextRequest, NextResponse } from 'next/server';
import { parseDriveLink } from '@/lib/driveLink';
import { addExtraFolder, listBlockedFolderIds } from '@/lib/extraFolders';
import { syncDriveNow } from '@/lib/drive';
import { probeDriveFolder } from '@/lib/driveProbe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Upload-only endpoint. Listing, removal and blocking deliberately live on
 * /api/upload-drive/admin so the public upload page cannot be used to undo
 * anything — it can only add.
 */
export async function POST(request: NextRequest) {
  try {
    const { link } = await request.json();
    const parsed = parseDriveLink(String(link || ''));

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'That does not look like a Google Drive link. Paste the folder share link.' },
        { status: 400 }
      );
    }
    if (parsed.kind === 'file') {
      return NextResponse.json(
        { success: false, error: 'That is a file link. Open the folder in Drive and share that instead.' },
        { status: 400 }
      );
    }

    if (listBlockedFolderIds().includes(parsed.id)) {
      return NextResponse.json(
        {
          success: false,
          error: 'That folder has been blocked by an administrator and cannot be added.',
        },
        { status: 403 }
      );
    }

    const probe = await probeDriveFolder(parsed.id);
    if (!probe.ok) {
      return NextResponse.json({ success: false, error: probe.reason }, { status: 400 });
    }

    const { added, persisted } = addExtraFolder(parsed.id, probe.name || parsed.id);
    if (!added) {
      return NextResponse.json({
        success: true,
        alreadyPresent: true,
        message: `"${probe.name || parsed.id}" is already in the gallery.`,
        data: { folderName: probe.name, persisted: true },
      });
    }

    // Kick the re-crawl off WITHOUT awaiting it. A full gallery crawl takes
    // over a minute, which would blow straight past Vercel's function timeout
    // and fail the request even though the folder was registered fine. The
    // cache is stale-while-revalidate, so the album appears on its own shortly.
    void syncDriveNow().catch((err) => {
      console.error('Post-add Drive sync failed:', err?.message || err);
    });

    return NextResponse.json({
      success: true,
      message: `Added "${probe.name || parsed.id}" — the album appears in the gallery within a minute or so.`,
      data: { folderName: probe.name, persisted },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Could not add that folder.' },
      { status: 500 }
    );
  }
}
