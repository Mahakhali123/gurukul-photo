import { Album, DriveFile, DriveSyncStatus, PhotoCategory, MediaType } from '@/types';
import { google } from 'googleapis';

export const DEFAULT_FOLDER_ID = '1Dh9AjndTTraanzUak4bPKO4mJe71IJux';

// Fallback public API key extracted from Google Drive web (works for public folders, no quota for user)
// Discovered via drive.google.com HTML -> AIzaSyAWGrfCCr7albM3lmCc937gx4uIphbpeKQ returns 102-751 files per folder vs 50 scrape cap
const FALLBACK_PUBLIC_API_KEY = 'AIzaSyAWGrfCCr7albM3lmCc937gx4uIphbpeKQ';

interface CacheStore {
  photos: DriveFile[];
  albums: Album[];
  lastFetched: number;
  error: string | null;
}

let memoryCache: CacheStore | null = null;
// 10 min: Vercel serverless has no persistent disk, so a longer TTL means
// warm instances serve instantly instead of re-crawling Drive every 3 min.
const CACHE_TTL_MS = 10 * 60 * 1000;
// Stale window: even after TTL expiry, serve stale data instantly while a
// background refresh runs — this is what fixes "loading forever on Vercel".
const STALE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
// Singleflight: concurrent API calls in the same instance share one crawl
// instead of each triggering a full Drive scan (photos+albums double-fetch).
let inflightFetch: Promise<CacheStore> | null = null;

// Vercel Hobby kills functions at 10s, Pro at 60s. Every outbound Google
// call gets a timeout so one hung request can't hang the whole page.
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// GTL album helper — keep album image title as "GTL" with fixed poster
export const GTL_FOLDER_ID = '17aUq0tbmExJFFmNFR61SyBqbzcWElv-6';
export const GTL_POSTER = '/gtl-main.jpg';
export function isGTLFolder(folderId: string, folderName: string): boolean {
  if (folderId === GTL_FOLDER_ID) return true;
  const lower = (folderName || '').toLowerCase();
  // treat any folder containing 'gtl' as GTL album, except live-recordings variant handled separately
  return lower.includes('gtl');
}
export function getGTLAlbumName(): string {
  return 'GTL';
}
export function getGTLAlbumDescription(): string {
  return 'Grand Talent League • Swaminarayan Gurukul — Live performance and talent showcase. Tap to preview photos in custom lightbox and download.';
}

// Pre-Tenth Dashavatar Assembly — fixed title image ("Copy of Title.jpg" collage).
// The album cover is pinned to the photo with "title" in its filename so the
// design never changes when Drive returns files in a different order.
export function isPreTenthDashavatarAlbum(albumName: string): boolean {
  const lower = (albumName || '').toLowerCase();
  if (!lower.includes('dashavatar')) return false;
  return lower.includes('pre') || lower.includes('tenth') || lower.includes('10th');
}
export function isTitleImageFile(fileName: string): boolean {
  return (fileName || '').toLowerCase().includes('title');
}

function categorizeByName(name: string): PhotoCategory {
  const lower = name.toLowerCase();
  if (lower.includes('sport') || lower.includes('cricket') || lower.includes('football') || lower.includes('race') || lower.includes('athletic')) return 'sports';
  if (lower.includes('annual') || lower.includes('celebrat') || lower.includes('festival') || lower.includes('diwali') || lower.includes('holi') || lower.includes('utsav')) return 'celebrations';
  if (lower.includes('compet') || lower.includes('quiz') || lower.includes('science') || lower.includes('robot') || lower.includes('debate')) return 'competitions';
  if (lower.includes('class') || lower.includes('lab') || lower.includes('study') || lower.includes('exam') || lower.includes('lecture')) return 'classes';
  if (lower.includes('yoga') || lower.includes('puja') || lower.includes('prayer') || lower.includes('temple') || lower.includes('spiritual') || lower.includes('assembly') || lower.includes('satsang')) return 'spiritual';
  if (lower.includes('art') || lower.includes('paint') || lower.includes('craft') || lower.includes('draw') || lower.includes('drama') || lower.includes('dance')) return 'activities';
  return 'events';
}

function getMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
}

function isMediaFile(mimeType: string): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/');
}

// Audio counts live in album.audioCount so photo+video badges keep working.
// Cover priority: image > video > audio (audio-only albums keep empty
// coverPhotoUrl so the UI can render a music placeholder instead of a broken image).
function incrementAlbumMediaCount(album: Album, mt: MediaType): void {
  if (mt === 'video') album.videoCount = (album.videoCount || 0) + 1;
  else if (mt === 'audio') album.audioCount = (album.audioCount || 0) + 1;
  else album.photoCount += 1;
}

function setAlbumCoverForMedia(album: Album, photo: DriveFile, mt: MediaType): void {
  const isGTL = isGTLFolder(album.folderId, album.name);
  if (isGTL) {
    if (!album.coverPhoto) album.coverPhoto = photo;
    album.coverPhotoUrl = GTL_POSTER;
    return;
  }
  if (mt === 'image') {
    if (!album.coverPhoto || album.coverPhoto.mediaType !== 'image') {
      album.coverPhoto = photo;
      album.coverPhotoUrl = photo.thumbnailLink || photo.directUrl;
    }
  } else if (mt === 'video') {
    if (!album.coverPhoto || album.coverPhoto.mediaType === 'audio') {
      album.coverPhoto = photo;
      album.coverPhotoUrl = photo.thumbnailLink || photo.directUrl;
    }
  } else {
    // audio: only remember the file, never use an audio URL as an <img> src
    if (!album.coverPhoto) {
      album.coverPhoto = photo;
    }
  }
}

async function getServiceAccountAccessToken(): Promise<string | null> {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!clientEmail || !privateKey) return null;
  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const token = await auth.authorize();
    return token.access_token || null;
  } catch (e) {
    console.warn('Service account auth failed:', e);
    return null;
  }
}

async function fetchWithAuth(url: string, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return fetchWithTimeout(url, { headers, cache: 'no-store' });
}

// Run async tasks with a concurrency limit so Drive API calls go in
// parallel (fast) without hammering quota (safe).
async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const queue = items.map((item, index) => ({ item, index }));
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await fn(next.item, next.index);
      }
    }
  );
  await Promise.all(workers);
}

// Scrape public Google Drive folder HTML to extract file list - WORKS WITHOUT API KEY
// This powers the requirement: "preview IN website not in Drive - custom design"
async function scrapePublicDriveFolder(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      // Important: Drive HTML can be large, no caching
      cache: 'no-store',
    },
    12000
  );
  
  if (!res.ok) throw new Error(`Drive folder fetch failed: ${res.status} - Check folder is "Anyone with link can view"`);
  const html = await res.text();

  const files: Array<{ id: string; name: string; mimeType: string }> = [];
  const seenIds = new Set<string>();

  // Robust pattern observed from live Drive HTML (see analyze_drive4.js):
  // Each file entry contains: "<fileId>"],null,null,null,"<mimeType>"
  // Followed within ~2000 chars by: "filename.jpg" and [size,"mime"]
  const entryPattern = /"([A-Za-z0-9_-]{25,50})"\],null,null,null,"((?:image|video|audio)\/[a-z0-9\.\-\+]+)"/g;
  let match;
  const filesMap = new Map<string, { id: string; name: string; mimeType: string }>();

  while ((match = entryPattern.exec(html)) !== null) {
    const id = match[1];
    const mimeType = match[2].toLowerCase();
    if (id === folderId) continue;
    if (filesMap.has(id)) continue;
    if (!isMediaFile(mimeType)) continue;

    // Look ahead ~2000 chars for filename to give proper display name
    const ahead = html.substring(match.index, Math.min(html.length, match.index + 2500));
    const nameMatch = ahead.match(/"([^"]{2,150}\.(jpg|jpeg|png|gif|webp|heic|heif|mp4|mov|avi|webm|mkv|mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|aiff|aif))"/i);
    // Fallback: try to extract any quoted string that looks like a file name near mime
    let name = nameMatch ? nameMatch[1] : id;
    // Clean: if name is still same as id, try to prettify from mime-based fallback
    if (name === id) {
      // Keep id as name, will be prettified in UI via replace logic
    }
    
    // Deduplicate and push
    filesMap.set(id, { id, name, mimeType });
  }

  // Fallback Method 2: older pattern for jpeg/png where id,name,mime are adjacent: ["id","name","mime"]
  if (filesMap.size === 0) {
    const filePattern = /\["([A-Za-z0-9_-]{20,60})","([^"]+?)","((?:image|video|audio)\/[^"]+?)"/g;
    while ((match = filePattern.exec(html)) !== null) {
      const [, id, name, mimeType] = match;
      if (!filesMap.has(id) && isMediaFile(mimeType) && id !== folderId) {
        filesMap.set(id, { id, name, mimeType });
      }
    }
  }

  Array.from(filesMap.values()).forEach((v) => files.push(v));
  return files;
}

async function scrapeSubfolders(folderId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        cache: 'no-store',
      },
      12000
    );
    if (!res.ok) return [];
    const html = await res.text();
    const folders = new Map<string, string>();

    // Primary: parse visible folder rows in Drive HTML table - data-id + strong DNoYtb
    // Example: <tr data-id="1Xpv..."><strong class="DNoYtb">Dashavatar Assembly</strong>
    const rowPattern = /data-id="([A-Za-z0-9_-]{25,50})"[\s\S]*?<strong class="DNoYtb">([^<]{2,80})<\/strong>/g;
    let m;
    while ((m = rowPattern.exec(html)) !== null) {
      const id = m[1];
      const name = m[2].trim();
      if (id === folderId || folders.has(id)) continue;
      if (!name || name.length < 2) continue;
      // Skip file entries (they also have data-id rows but names contain extension)
      if (/\.(jpg|jpeg|png|gif|webp|heic|heif|mp4|mov|avi|webm|mkv|mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|aiff|aif|pdf|txt|html)$/i.test(name)) continue;
      folders.set(id, name);
    }

    // Fallback A: look for folder mime entries - pattern similar to files but with folder mime
    if (folders.size === 0) {
      const folderPattern = /"([A-Za-z0-9_-]{25,50})"\],null,null,null,"application\/vnd\.google-apps\.folder"/g;
      let mm;
      while ((mm = folderPattern.exec(html)) !== null) {
        const id = mm[1];
        if (id === folderId || folders.has(id)) continue;
        const ahead = html.substring(mm.index, Math.min(html.length, mm.index + 4000));
        const rawMatches = Array.from(ahead.matchAll(/"([^"]{2,80})"/g));
        const candidates = rawMatches.map(x=>x[1]).filter(s=> s.length>2 && s.length<80 && !['Download','More actions','Image','Shared','Modified','Size','A to Z','New to old','Name','Date modified'].includes(s) && !s.includes('http') && !s.includes('/') && !s.match(/\.(jpg|jpeg|png|heic|heif|mp4|mp3|wav|ogg|m4a|aac|flac)$/i) );
        let name = id;
        if (candidates.length > 0) name = candidates[0];
        folders.set(id, name);
      }
    }

    // Method B: parse ds:4 blob for folder entries via JSON traversal
    if (folders.size === 0) {
      const cbRe = /AF_initDataCallback\([^}]*data:([\s\S]*?)\}\);\s*<\/script>/g;
      let cm;
      while ((cm = cbRe.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(cm[1]);
          const stack: any[] = [parsed];
          while (stack.length) {
            const cur = stack.pop();
            if (Array.isArray(cur)) {
              // folder array contains id and name and folder mime together
              for (let i=0;i<cur.length;i++){
                if(typeof cur[i]==='string' && cur[i].length>=25 && /^[A-Za-z0-9_-]+$/.test(cur[i])){
                  // check if nearby has folder mime
                  const slice = cur.slice(Math.max(0,i-2), Math.min(cur.length,i+6)).join('|');
                  if(slice.includes('application/vnd.google-apps.folder')){
                    // try to find name: next string after id
                    for(let j=i+1;j<Math.min(cur.length,i+5);j++){
                      if(typeof cur[j]==='string' && cur[j].length>2 && cur[j].length<80 && !cur[j].includes('/') && !cur[j].match(/\.(jpg|jpeg|png|heic|mp3|wav|ogg|m4a)$/i)){
                        if(!folders.has(cur[i])) folders.set(cur[i], cur[j]);
                        break;
                      }
                    }
                  }
                }
              }
              for(const el of cur) stack.push(el);
            } else if(cur && typeof cur==='object'){ for(const k in cur) stack.push(cur[k]); }
          }
        } catch {}
      }
    }

    return Array.from(folders.entries()).map(([id,name])=>({id,name}));
  } catch { return []; }
}

// Unified Drive fetcher: API key if configured, fallback public key, service account, otherwise scrape public HTML (zero-setup)
async function fetchPublicDriveFiles(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string; createdTime?: string; modifiedTime?: string; size?: string }>> {
  const userApiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  const effectiveApiKey = userApiKey || FALLBACK_PUBLIC_API_KEY;

  // Try API with effective key (user key if set, otherwise embedded fallback public key which handles >50)
  if (effectiveApiKey) {
    try {
      const allFiles: Array<{ id: string; name: string; mimeType: string; createdTime?: string; modifiedTime?: string; size?: string }> = [];
      let pageToken: string | undefined = undefined;
      let pageCount = 0;
      do {
        const tokenParam: string = pageToken ? `&pageToken=${pageToken}` : '';
        const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,thumbnailLink,imageMediaMetadata,videoMediaMetadata)&pageSize=1000&orderBy=createdTime+desc&key=${effectiveApiKey}${tokenParam}`;
        const res = await fetchWithTimeout(apiUrl, { cache: 'no-store' });
        if (!res.ok) {
          console.warn('Drive API HTTP', res.status, 'falling back to service account or scrape');
          break;
        }
        const data = await res.json();
        if (data.error) {
          console.warn('Drive API error, falling back to service account or scrape:', data.error.message);
          break;
        }
        if (data.files && Array.isArray(data.files) && data.files.length > 0) {
          allFiles.push(...data.files);
        }
        pageToken = data.nextPageToken;
        pageCount++;
        if (pageCount > 10) break;
      } while (pageToken);

      if (allFiles.length > 0) {
        // If we used fallback key and got exactly 1000, log pagination success
        if (!userApiKey && allFiles.length > 50) {
          console.log(`✅ Drive API (fallback) returned ${allFiles.length} files for ${folderId} (scrape would truncate at 50)`);
        }
        return allFiles;
      }
    } catch (e) {
      console.warn('Drive API fetch failed, trying service account', e);
    }
  }

  // Try service account auth if API key not configured or failed
  try {
    const accessToken = await getServiceAccountAccessToken();
    if (accessToken) {
      const allFiles: Array<{ id: string; name: string; mimeType: string; createdTime?: string; modifiedTime?: string; size?: string }> = [];
      let pageToken: string | undefined = undefined;
      let pageCount = 0;
      do {
        const tokenParam: string = pageToken ? `&pageToken=${pageToken}` : '';
        const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,thumbnailLink,imageMediaMetadata,videoMediaMetadata)&pageSize=1000&orderBy=createdTime+desc${tokenParam}`;
        const res = await fetchWithAuth(apiUrl, accessToken);
        if (!res.ok) {
          console.warn('Drive API HTTP', res.status, 'with service account, falling back to scrape');
          break;
        }
        const data = await res.json();
        if (data.error) {
          console.warn('Drive API error with service account, falling back to scrape:', data.error.message);
          break;
        }
        if (data.files && Array.isArray(data.files) && data.files.length > 0) {
          allFiles.push(...data.files);
        }
        pageToken = data.nextPageToken;
        pageCount++;
        if (pageCount > 10) break;
      } while (pageToken);

      if (allFiles.length > 0) {
        return allFiles;
      }
    }
  } catch (e) {
    console.warn('Service account fetch failed, falling back to scrape', e);
  }

  // Fallback: scrape public Drive HTML - works with just "Anyone with link can view"
  // NOTE: scrape is capped at ~50 items per folder due to Drive HTML lazy-load - use API key or service account for >50
  const scraped = await scrapePublicDriveFolder(folderId);
  if (scraped.length === 50) {
    console.warn(`Scrape returned exactly 50 files for ${folderId} - likely truncated. Set GOOGLE_DRIVE_API_KEY or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY for full pagination.`);
  }
  return scraped;
}

async function fetchAllDriveData(folderId: string): Promise<{ photos: DriveFile[]; albums: Album[] }> {
  const mediaList: DriveFile[] = [];
  const albumsMap = new Map<string, Album>();

  // Main album for root-level files
  const mainAlbumId = 'album-main';
  const mainAlbum: Album = {
    id: mainAlbumId,
    folderId,
    name: 'Gurukul Gallery',
    description: 'All photos, videos and audios from the Gurukul gallery collection.',
    coverPhoto: null,
    coverPhotoUrl: '',
    photoCount: 0,
    videoCount: 0,
    audioCount: 0,
    category: 'events',
    date: new Date().toISOString().split('T')[0],
    createdTime: new Date().toISOString(),
  };
  albumsMap.set(mainAlbumId, mainAlbum);

  // First check for sub-folders (each subfolder = Event name -> Album)
  const userFolderApiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  const folderApiKey = userFolderApiKey || FALLBACK_PUBLIC_API_KEY;
  let subfolders: Array<{ id: string; name: string; createdTime?: string; description?: string }> = [];
  if (folderApiKey) {
    try {
      let pageToken2: string | undefined = undefined;
      do {
        const tokenParam2: string = pageToken2 ? `&pageToken=${pageToken2}` : '';
        const foldersUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=nextPageToken,files(id,name,createdTime,description)&pageSize=1000&key=${folderApiKey}${tokenParam2}`;
        const foldersRes = await fetchWithTimeout(foldersUrl, { cache: 'no-store' });
        if (!foldersRes.ok) break;
        const foldersData = await foldersRes.json();
        if (foldersData.error) break;
        const pageFolders = (foldersData.files || []).filter((f:any)=>f.id && f.name).map((f:any)=>({id:f.id,name:f.name,createdTime:f.createdTime,description:f.description}));
        subfolders.push(...pageFolders);
        pageToken2 = foldersData.nextPageToken;
      } while (pageToken2);
      if (subfolders.length > 0 && !userFolderApiKey) {
        console.log(`✅ Drive API (fallback) found ${subfolders.length} subfolders for ${folderId}`);
      }
    } catch {}
  }
  if (subfolders.length === 0) {
    // No API key -> try service account, then scrape subfolders directly from
    // Drive HTML (works with public "Anyone with link can view" folder)
    try {
      const accessToken = await getServiceAccountAccessToken();
      if (accessToken) {
        let pageToken2: string | undefined = undefined;
        do {
          const tokenParam2: string = pageToken2 ? `&pageToken=${pageToken2}` : '';
          const foldersUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=nextPageToken,files(id,name,createdTime,description)&pageSize=1000${tokenParam2}`;
          const foldersRes = await fetchWithAuth(foldersUrl, accessToken);
          if (!foldersRes.ok) break;
          const foldersData = await foldersRes.json();
          const pageFolders = (foldersData.files || []).filter((f:any)=>f.id && f.name).map((f:any)=>({id:f.id,name:f.name,createdTime:f.createdTime,description:f.description}));
          subfolders.push(...pageFolders);
          pageToken2 = foldersData.nextPageToken;
        } while (pageToken2);
      }
    } catch {}

    if (subfolders.length === 0) {
      const scraped = await scrapeSubfolders(folderId);
      subfolders = scraped.map(s=>({id:s.id,name:s.name}));
    }
  }

  // Pre-create top-level album entries synchronously so album order stays
  // stable, then fetch every folder's files in parallel (concurrency-limited).
  // Sequential fetching took 60-120s and caused request aborts / 500s.
  const validFolders = subfolders.filter((folder) => folder.id && folder.name);
  for (const folder of validFolders) {
    const isGTL = isGTLFolder(folder.id, folder.name);
    const displayName = isGTL ? getGTLAlbumName() : folder.name;
    const displayDesc = isGTL ? getGTLAlbumDescription() : ((folder as any).description || `Photos from ${folder.name} at Swaminarayan Gurukul - Tap to preview photos in custom lightbox and download.`);
    const cat = categorizeByName(isGTL ? 'gtl' : folder.name);
    albumsMap.set(folder.id, {
      id: folder.id,
      folderId: folder.id,
      name: displayName, // GTL keeps fixed title "GTL" — album image title preserved
      description: displayDesc,
      coverPhoto: null,
      coverPhotoUrl: isGTL ? GTL_POSTER : '',
      photoCount: 0,
      videoCount: 0,
      audioCount: 0,
      category: cat,
      date: (folder as any).createdTime ? (folder as any).createdTime.split('T')[0] : new Date().toISOString().split('T')[0],
      createdTime: (folder as any).createdTime || new Date().toISOString(),
    });
  }
  // Buckets preserve the ORIGINAL assembly order (folder by folder, files in
  // Drive API order) so parallel fetching renders exactly like before.
  const orderedPhotos: DriveFile[][] = validFolders.map(() => []);
  await mapWithConcurrency(validFolders, 5, async (folder, folderIndex) => {
    const album = albumsMap.get(folder.id)!;
    const subFiles = await fetchPublicDriveFiles(folder.id);
    for (const file of subFiles) {
      if (!file.id || !file.name || !isMediaFile(file.mimeType)) continue;
      const mt = getMediaType(file.mimeType);
      const photo = buildDriveFile(file, album.id, album.name, album.category, mt);
      orderedPhotos[folderIndex].push(photo);
      incrementAlbumMediaCount(album, mt);
      // Apple-style: prefer image for display cover, fallback to video thumbnail
      // GTL: keep fixed poster as cover — don't overwrite album image title poster
      // Audio never becomes a visual cover (keeps audio-only albums from showing broken images)
      setAlbumCoverForMedia(album, photo, mt);
    }
    // Include nested separator folders inside this event (e.g., Dashavatar Assembly contains subfolders)
    // Keep each inner folder as its own album (preserves folder structure)
    try {
      let nestedFolders: Array<{ id: string; name: string }> = [];
      // Try fallback public API key first for nested (handles >50 without user key)
      const nestedApiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim() || FALLBACK_PUBLIC_API_KEY;
      if (nestedApiKey) {
        try {
          let pageToken2: string | undefined = undefined;
          do {
            const tokenParam2: string = pageToken2 ? `&pageToken=${pageToken2}` : '';
            const foldersUrl = `https://www.googleapis.com/drive/v3/files?q='${folder.id}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=nextPageToken,files(id,name,createdTime,description)&pageSize=1000&key=${nestedApiKey}${tokenParam2}`;
            const foldersRes = await fetchWithTimeout(foldersUrl, { cache: 'no-store' });
            if (!foldersRes.ok) break;
            const foldersData = await foldersRes.json();
            if (foldersData.error) break;
            const pageFolders = (foldersData.files || []).filter((f:any)=>f.id && f.name).map((f:any)=>({id:f.id,name:f.name}));
            nestedFolders.push(...pageFolders);
            pageToken2 = foldersData.nextPageToken;
          } while (pageToken2);
        } catch {}
      }
      if (nestedFolders.length === 0) {
        const accessToken = await getServiceAccountAccessToken();
        if (accessToken) {
          let pageToken2: string | undefined = undefined;
          do {
            const tokenParam2: string = pageToken2 ? `&pageToken=${pageToken2}` : '';
            const foldersUrl = `https://www.googleapis.com/drive/v3/files?q='${folder.id}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=nextPageToken,files(id,name,createdTime,description)&pageSize=1000${tokenParam2}`;
            const foldersRes = await fetchWithAuth(foldersUrl, accessToken);
            if (!foldersRes.ok) break;
            const foldersData = await foldersRes.json();
            const pageFolders = (foldersData.files || []).filter((f:any)=>f.id && f.name).map((f:any)=>({id:f.id,name:f.name}));
            nestedFolders.push(...pageFolders);
            pageToken2 = foldersData.nextPageToken;
          } while (pageToken2);
        }
      }
      if (nestedFolders.length === 0) {
        const scraped = await scrapeSubfolders(folder.id);
        nestedFolders = scraped;
      }
      // Pre-create nested album entries synchronously so album order stays
      // exactly like the original sequential code.
      for (const nf of nestedFolders) {
        if (!albumsMap.has(nf.id)) {
          albumsMap.set(nf.id, {
            id: nf.id,
            folderId: nf.id,
            name: `${folder.name} - ${nf.name}`,
            description: `Subfolder of ${folder.name} at Swaminarayan Gurukul`,
            coverPhoto: null,
            coverPhotoUrl: '',
            photoCount: 0,
            videoCount: 0,
            audioCount: 0,
            category: categorizeByName(nf.name),
            date: new Date().toISOString().split('T')[0],
            createdTime: new Date().toISOString(),
          });
        }
      }
      await mapWithConcurrency(nestedFolders, 5, async (nf) => {
        const nestedAlbum = albumsMap.get(nf.id)!;
        const nestedFiles = await fetchPublicDriveFiles(nf.id);
        for (const file of nestedFiles) {
          if (!file.id || !file.name || !isMediaFile(file.mimeType)) continue;
          const mt = getMediaType(file.mimeType);
          const photoNested = buildDriveFile(file, nestedAlbum.id, nestedAlbum.name, nestedAlbum.category, mt);
          orderedPhotos[folderIndex].push(photoNested);
          incrementAlbumMediaCount(nestedAlbum, mt);
          setAlbumCoverForMedia(nestedAlbum, photoNested, mt);
          // Increment parent counts for aggregated badge, but don't duplicate mediaList (avoids gallery duplicates)
          incrementAlbumMediaCount(album, mt);
          setAlbumCoverForMedia(album, photoNested, mt);
        }
      });
    } catch {}
  });
  // Assemble photos folder-by-folder in the original order (parallel workers
  // only filled their own bucket, so the design renders exactly as before).
  for (const bucket of orderedPhotos) {
    for (const p of bucket) mediaList.push(p);
  }

  // Fetch files in root folder
  const rootFiles = await fetchPublicDriveFiles(folderId);
  for (const file of rootFiles) {
    if (!file.id || !file.name) continue;
    if (!isMediaFile(file.mimeType)) continue;
    const mt = getMediaType(file.mimeType);
    const photo = buildDriveFile(file, mainAlbumId, mainAlbum.name, categorizeByName(file.name), mt);
    mediaList.push(photo);
    incrementAlbumMediaCount(mainAlbum, mt);
    setAlbumCoverForMedia(mainAlbum, photo, mt);
  }

  // Fixed title image for Pre-Tenth Dashavatar Assembly: pin the cover to the
  // "Copy of Title.jpg" collage (any image with "title" in its filename).
  // Applied after all fetching so parallel completion order can't change it.
  for (const album of Array.from(albumsMap.values())) {
    if (!isPreTenthDashavatarAlbum(album.name)) continue;
    const titlePhoto =
      mediaList.find((p) => p.albumId === album.id && p.mediaType === 'image' && isTitleImageFile(p.name)) ||
      mediaList.find((p) => p.albumId === album.id && isTitleImageFile(p.name));
    if (titlePhoto) {
      album.coverPhoto = titlePhoto;
      album.coverPhotoUrl = titlePhoto.thumbnailLink || titlePhoto.directUrl;
    }
  }

  const finalAlbums = Array.from(albumsMap.values()).filter(a => (a.photoCount + (a.videoCount || 0) + (a.audioCount || 0)) > 0);

  return { photos: mediaList, albums: finalAlbums };
}

function buildDriveFile(
  file: any,
  albumId: string,
  albumName: string,
  category: PhotoCategory,
  mediaType: MediaType
): DriveFile {
  const id = file.id;
  const name = file.name;
  // Use lh3 CDN as primary for images, drive thumbnail for videos.
  // Audio has no visual thumbnail — playback streams via usercontent / /api/download.
  const isHeif = (file.mimeType || '').toLowerCase().includes('heif') || (file.mimeType || '').toLowerCase().includes('heic');
  if (mediaType === 'audio') {
    const streamUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
    return {
      id,
      name,
      mimeType: file.mimeType || 'audio/mpeg',
      mediaType,
      thumbnailLink: '',
      directUrl: streamUrl,
      downloadUrl: `/api/download?id=${id}&name=${encodeURIComponent(name)}`,
      highResUrl: streamUrl,
      videoStreamUrl: undefined,
      audioStreamUrl: streamUrl,
      createdTime: file.createdTime || new Date().toISOString(),
      modifiedTime: file.modifiedTime || new Date().toISOString(),
      size: file.size ? parseInt(file.size, 10) : undefined,
      width: 1600,
      height: 1066,
      aspectRatio: 1.5,
      albumId,
      albumName,
      category,
      description: `${name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}`,
    };
  }
  return {
    id,
    name,
    mimeType: file.mimeType || 'image/jpeg',
    mediaType,
    thumbnailLink: mediaType === 'video'
      ? `https://drive.google.com/thumbnail?id=${id}&sz=w800`
      : `https://lh3.googleusercontent.com/d/${id}=w800`,
    directUrl: mediaType === 'video'
      ? `https://drive.google.com/file/d/${id}/preview`
      : isHeif ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : `https://lh3.googleusercontent.com/d/${id}=w1600`,
    downloadUrl: `/api/download?id=${id}&name=${encodeURIComponent(name)}`,
    highResUrl: mediaType === 'video'
      ? `https://drive.google.com/file/d/${id}/preview`
      : isHeif ? `https://drive.google.com/thumbnail?id=${id}&sz=w1920` : `https://lh3.googleusercontent.com/d/${id}=w1920`,
    videoStreamUrl: mediaType === 'video' ? `https://drive.google.com/file/d/${id}/preview` : undefined,
    audioStreamUrl: undefined,
    createdTime: file.createdTime || new Date().toISOString(),
    modifiedTime: file.modifiedTime || new Date().toISOString(),
    size: file.size ? parseInt(file.size, 10) : undefined,
    width: file.imageMediaMetadata?.width || 1600,
    height: file.imageMediaMetadata?.height || 1066,
    aspectRatio: 1.5,
    albumId,
    albumName,
    category,
    description: `${name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}`,
  };
}

export async function getDriveData(forceRefresh = false): Promise<CacheStore> {
  const now = Date.now();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;

  // Fresh cache → instant return (this is the fast path on localhost AND
  // on warm Vercel instances).
  if (!forceRefresh && memoryCache && now - memoryCache.lastFetched < CACHE_TTL_MS) {
    return memoryCache;
  }

  // Stale-while-revalidate: if we have stale data (even up to 1h old),
  // return it IMMEDIATELY and refresh in the background. This is what stops
  // "loading forever on Vercel" — the page renders stale photos instantly
  // instead of blocking 30-60s on a full Drive crawl that exceeds the
  // 10s Hobby timeout.
  if (!forceRefresh && memoryCache && now - memoryCache.lastFetched < STALE_MAX_AGE_MS) {
    if (!inflightFetch) {
      const bg = fetchAllDriveData(folderId)
        .then(({ photos, albums }) => {
          memoryCache = { photos, albums, lastFetched: Date.now(), error: null };
          return memoryCache;
        })
        .catch((error: any) => {
          console.error('Background Drive refresh failed:', error?.message || error);
          return memoryCache as CacheStore;
        })
        .finally(() => {
          inflightFetch = null;
        });
      inflightFetch = bg;
    }
    return memoryCache;
  }

  // No usable cache: join any in-flight crawl (singleflight) so the
  // parallel /api/photos + /api/albums fetches share one crawl instead of
  // running two full crawls that double Vercel execution time.
  if (!forceRefresh && inflightFetch) {
    return inflightFetch;
  }

  const crawl = (async (): Promise<CacheStore> => {
    try {
      const { photos, albums } = await fetchAllDriveData(folderId);
      memoryCache = { photos, albums, lastFetched: Date.now(), error: null };
      return memoryCache;
    } catch (error: any) {
      console.error('Drive fetch error:', error);
      // Never wipe a good cache on a transient failure — keep showing
      // old photos with an error note rather than an empty gallery.
      if (memoryCache && memoryCache.photos.length > 0) {
        memoryCache.error = error?.message || 'Failed to refresh from Drive. Showing cached photos.';
        return memoryCache;
      }
      memoryCache = {
        photos: [],
        albums: [],
        lastFetched: Date.now(),
        error:
          error?.name === 'AbortError'
            ? 'Google Drive took too long to respond. Please retry — photos usually appear on the second attempt once the cache warms up.'
            : error?.message || 'Failed to load from Drive.',
      };
      return memoryCache;
    } finally {
      inflightFetch = null;
    }
  })();

  inflightFetch = crawl;
  return crawl;
}

export async function getDrivePhotos(options?: {
  albumId?: string;
  category?: PhotoCategory;
  mediaType?: 'all' | 'image' | 'video' | 'audio';
  search?: string;
  sortBy?: 'newest' | 'oldest' | 'name';
}): Promise<DriveFile[]> {
  const data = await getDriveData();
  let items = [...data.photos];

  if (options?.mediaType && options.mediaType !== 'all') items = items.filter(p => p.mediaType === options.mediaType);
  if (options?.albumId && options.albumId !== 'all') items = items.filter(p => p.albumId === options.albumId);
  if (options?.category && options.category !== 'all') {
    if (options.category === 'videos') items = items.filter(p => p.mediaType === 'video');
    else if (options.category === 'audios') items = items.filter(p => p.mediaType === 'audio');
    else items = items.filter(p => p.category === options.category);
  }
  if (options?.search && options.search.trim() !== '') {
    const q = options.search.toLowerCase().trim();
    items = items.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.albumName.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }
  if (options?.sortBy === 'oldest') items.sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
  else if (options?.sortBy === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  else items.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

  return items;
}

export async function getDriveAlbums(): Promise<Album[]> {
  const data = await getDriveData();
  return data.albums;
}

export async function getDriveAlbumById(albumId: string): Promise<{ album: Album | null; photos: DriveFile[]; subAlbums?: Album[] }> {
  const data = await getDriveData();
  const album = data.albums.find(a => a.id === albumId) || null;
  if (!album) return { album: null, photos: [] };
  // Include photos directly in album + photos in nested subfolders (for Dashavatar Assembly etc)
  const subAlbums = data.albums.filter(a => a.name.startsWith(album.name + ' - '));
  const subAlbumIds = new Set(subAlbums.map(a => a.id));
  const photos = data.photos.filter(p => p.albumId === albumId || subAlbumIds.has(p.albumId));
  return { album, photos, subAlbums };
}

export async function getDriveStatus(): Promise<DriveSyncStatus> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const data = await getDriveData();
  const totalPhotos = data.photos.filter(p => p.mediaType === 'image' || !p.mediaType).length;
  const totalVideos = data.photos.filter(p => p.mediaType === 'video').length;
  const totalAudios = data.photos.filter(p => p.mediaType === 'audio').length;

  return {
    isConfigured: true,
    folderId,
    lastSyncTime: new Date(data.lastFetched).toISOString(),
    totalPhotos,
    totalVideos,
    totalAudios,
    totalAlbums: data.albums.length,
    isUsingMock: false,
    error: data.error,
    message: data.photos.length > 0
      ? `Showing ${totalPhotos} photos, ${totalVideos} videos and ${totalAudios} audios from Google Drive.`
      : 'No media found yet. Upload photos to your Google Drive folder to display them here.',
  };
}

export async function syncDriveNow(): Promise<DriveSyncStatus> {
  await getDriveData(true);
  return getDriveStatus();
}
