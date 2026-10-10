import fs from 'fs';
import path from 'path';

export interface ExtraFolder {
  id: string;
  label: string;
  addedAt: string;
  /** Set by env var rather than added at runtime — cannot be removed from the UI. */
  fromEnv?: boolean;
}

interface Store {
  folders: ExtraFolder[];
  blocked: ExtraFolder[];
}

const STORE_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(STORE_DIR, 'extra-folders.json');

/**
 * Folders added on top of GOOGLE_DRIVE_FOLDER_ID, plus a blocklist of folders
 * to keep out of the gallery.
 *
 * Two layers, because the deploy target decides what can persist:
 *
 * 1. `EXTRA_DRIVE_FOLDER_IDS` / `BLOCKED_DRIVE_FOLDER_IDS` (comma-separated) —
 *    read-only, always applied. This is the layer that survives on Vercel,
 *    whose filesystem is read-only and whose instances are recycled freely.
 * 2. A JSON file under `data/`, written at runtime. Works on localhost and any
 *    host with a persistent disk. On Vercel the write fails and we fall back to
 *    an in-process copy, so a change lasts only as long as that instance —
 *    which is why the admin page surfaces the env strings to paste into the
 *    project settings for a permanent change.
 */
let memoryStore: Store | null = null;
let memoryOnly = false;

function envList(varName: string): ExtraFolder[] {
  return (process.env[varName] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({ id, label: `From ${varName}`, addedAt: '', fromEnv: true }));
}

function emptyStore(): Store {
  return { folders: [], blocked: [] };
}

function readStore(): Store {
  if (memoryOnly && memoryStore) return memoryStore;
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    // Legacy shape: a bare array of added folders, before blocking existed.
    if (Array.isArray(parsed)) return { folders: parsed, blocked: [] };
    return {
      folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
      blocked: Array.isArray(parsed?.blocked) ? parsed.blocked : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store): { persisted: boolean } {
  memoryStore = store;
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    return { persisted: true };
  } catch {
    // Read-only filesystem (Vercel) — keep it for this instance at least.
    memoryOnly = true;
    return { persisted: false };
  }
}

function merge(env: ExtraFolder[], stored: ExtraFolder[]): ExtraFolder[] {
  const out = new Map<string, ExtraFolder>();
  for (const f of env) out.set(f.id, f);
  for (const f of stored) out.set(f.id, f);
  return Array.from(out.values());
}

// ---------------------------------------------------------------------------
// Added folders
// ---------------------------------------------------------------------------

export function listExtraFolders(): ExtraFolder[] {
  return merge(envList('EXTRA_DRIVE_FOLDER_IDS'), readStore().folders);
}

/** Ids to crawl — anything on the blocklist is dropped here, so a blocked
 *  folder is never fetched even if it is also in the added list. */
export function listExtraFolderIds(): string[] {
  const blocked = new Set(listBlockedFolderIds());
  return listExtraFolders()
    .map((f) => f.id)
    .filter((id) => !blocked.has(id));
}

export function addExtraFolder(
  id: string,
  label: string
): { added: boolean; persisted: boolean } {
  if (listExtraFolders().some((f) => f.id === id)) return { added: false, persisted: true };
  const store = readStore();
  const next: Store = {
    ...store,
    folders: [...store.folders, { id, label, addedAt: new Date().toISOString() }],
  };
  return { added: true, persisted: writeStore(next).persisted };
}

export function removeExtraFolder(id: string): { removed: boolean; reason?: string } {
  if (envList('EXTRA_DRIVE_FOLDER_IDS').some((f) => f.id === id)) {
    return {
      removed: false,
      reason:
        'That folder comes from the EXTRA_DRIVE_FOLDER_IDS environment variable, so it is re-added on every boot. Remove it there, or block it instead.',
    };
  }
  const store = readStore();
  const next: Store = { ...store, folders: store.folders.filter((f) => f.id !== id) };
  writeStore(next);
  return { removed: true };
}

// ---------------------------------------------------------------------------
// Blocklist
// ---------------------------------------------------------------------------

export function listBlockedFolders(): ExtraFolder[] {
  return merge(envList('BLOCKED_DRIVE_FOLDER_IDS'), readStore().blocked);
}

export function listBlockedFolderIds(): string[] {
  return listBlockedFolders().map((f) => f.id);
}

export function blockFolder(id: string, label: string): { blocked: boolean; persisted: boolean } {
  if (listBlockedFolders().some((f) => f.id === id)) return { blocked: false, persisted: true };
  const store = readStore();
  const next: Store = {
    ...store,
    blocked: [...store.blocked, { id, label, addedAt: new Date().toISOString() }],
  };
  return { blocked: true, persisted: writeStore(next).persisted };
}

export function unblockFolder(id: string): { unblocked: boolean; reason?: string } {
  if (envList('BLOCKED_DRIVE_FOLDER_IDS').some((f) => f.id === id)) {
    return {
      unblocked: false,
      reason:
        'That block comes from the BLOCKED_DRIVE_FOLDER_IDS environment variable, so it is re-applied on every boot. Remove it there instead.',
    };
  }
  const store = readStore();
  const next: Store = { ...store, blocked: store.blocked.filter((f) => f.id !== id) };
  writeStore(next);
  return { unblocked: true };
}

/** Comma-separated env values the admin page tells you to paste into Vercel. */
export function envStrings(): { extra: string; blocked: string } {
  return {
    extra: listExtraFolders().map((f) => f.id).join(','),
    blocked: listBlockedFolderIds().join(','),
  };
}
