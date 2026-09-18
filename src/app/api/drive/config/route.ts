import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { syncDriveNow } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, folderId } = body;

    const envPath = path.join(process.cwd(), '.env.local');
    
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const currentFolderId = folderId?.trim() || '1Dh9AjndTTraanzUak4bPKO4mJe71IJux';
    const currentApiKey = apiKey !== undefined ? apiKey.trim() : (process.env.GOOGLE_DRIVE_API_KEY || '');

    process.env.GOOGLE_DRIVE_FOLDER_ID = currentFolderId;
    process.env.GOOGLE_DRIVE_API_KEY = currentApiKey;

    const newEnv = `# Swaminarayan Gurukul Student Photo Gallery
GOOGLE_DRIVE_FOLDER_ID="${currentFolderId}"
GOOGLE_DRIVE_API_KEY="${currentApiKey}"
`;

    fs.writeFileSync(envPath, newEnv, 'utf8');

    // Trigger immediate refresh with the updated key
    const status = await syncDriveNow();

    return NextResponse.json({
      success: true,
      message: 'Drive configuration updated successfully!',
      data: status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update configuration' },
      { status: 500 }
    );
  }
}
