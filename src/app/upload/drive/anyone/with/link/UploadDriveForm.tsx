'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2, Link2, Check, AlertTriangle, FolderPlus } from 'lucide-react';

export function UploadDriveForm() {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWarning(null);
    try {
      const res = await fetch('/api/upload-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Could not add that folder.');
        return;
      }
      setNotice(json.message || 'Folder added.');
      if (json.data?.folderName) {
        setAdded((prev) => [json.data.folderName, ...prev].slice(0, 8));
      }
      setLink('');
      if (json.data && json.data.persisted === false) {
        setWarning(
          'Saved for this server instance only — this host has a read-only filesystem. An administrator can make it permanent from the admin page.'
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Network error while adding the folder.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gk-container py-12 lg:pt-[90px]">
      <span className="eyebrow">Upload</span>
      <h1 className="h1-common mt-3">Add a Drive folder</h1>
      <p className="mt-5 max-w-2xl text-[18px] leading-[1.75]">
        Paste a Google Drive <strong>folder</strong> link shared as{' '}
        <em>&ldquo;Anyone with the link&rdquo;</em>. The folder is added to the gallery as an
        album, and its sub-folders become albums of their own.
      </p>

      <form onSubmit={submit} className="mt-8 max-w-3xl">
        <label className="gk-label" htmlFor="drive-link">
          Google Drive folder link
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cc0000]" />
            <input
              id="drive-link"
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="gk-field pl-11"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={busy || !link.trim()}
            className="gk-btn gk-btn-primary disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
            {busy ? 'Adding…' : 'Add folder'}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-5 flex max-w-3xl items-start gap-2 border border-[#cc0000]/40 bg-[#eff2f6] px-4 py-3 text-[16px] text-[#cc0000]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-5 flex max-w-3xl items-start gap-2 border border-[#dddddd] bg-[#eff2f6] px-4 py-3 text-[16px] text-[#212529]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#cc0000]" />
          <span>
            {notice}{' '}
            <Link href="/albums" className="text-[#cc0000] underline">
              View albums
            </Link>
          </span>
        </p>
      )}

      {warning && (
        <p className="mt-3 flex max-w-3xl items-start gap-2 border border-[#dddddd] bg-white px-4 py-3 text-[15px] text-[#6c757d]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#cc0000]" />
          {warning}
        </p>
      )}

      {added.length > 0 && (
        <div className="mt-10 max-w-3xl">
          <h2 className="h4-common">Added in this session</h2>
          <ul className="mt-3 space-y-1 text-[17px] text-[#212529]">
            {added.map((name, i) => (
              <li key={`${name}-${i}`} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-[#cc0000]" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-12 max-w-3xl text-[15px] text-[#6c757d]">
        This page can only add folders. Removing an uploaded folder, or blocking one, is done by
        an administrator.
      </p>
    </div>
  );
}
