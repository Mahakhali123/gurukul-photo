'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, Trash2, Ban, Undo2, Copy, ShieldAlert } from 'lucide-react';

interface Folder {
  id: string;
  label: string;
  addedAt: string;
  fromEnv?: boolean;
}

interface Payload {
  folders: Folder[];
  blocked: Folder[];
  albums: { id: string; name: string }[];
  rootFolderId: string;
  env: { extra: string; blocked: string };
}

function EnvBlock({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="flex-1 overflow-x-auto whitespace-nowrap border border-[#dddddd] bg-white px-3 py-2 font-mono text-[13px]">
        {name}={value}
      </code>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(`${name}=${value}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="inline-flex shrink-0 items-center gap-2 border-2 border-[#212529] px-4 py-2 text-[16px] text-[#212529] transition-colors hover:bg-[#212529] hover:text-white"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function AdminDrivePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockInput, setBlockInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/upload-drive/admin');
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || 'Could not load admin data.');
    } catch (err: any) {
      setError(err?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(
    method: 'POST' | 'DELETE',
    body: Record<string, unknown>,
    key: string
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/upload-drive/admin', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'That did not work.');
        return;
      }
      if (json.data) setData((prev) => (prev ? { ...prev, ...json.data } : prev));
      setNotice(json.message || 'Done.');
    } catch (err: any) {
      setError(err?.message || 'Network error.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="gk-container py-12 lg:pt-[90px]">
      <span className="eyebrow">Administrator</span>
      <h1 className="h1-common mt-3">Manage Drive folders</h1>
      <p className="mt-5 max-w-2xl text-[18px] leading-[1.75]">
        Remove folders that were added through the upload page, and block folders so they stay out
        of the gallery. Blocking also applies to albums inside the main Gurukul folder.
      </p>

      <p className="mt-5 flex max-w-3xl items-start gap-2 border border-[#cc0000]/40 bg-[#eff2f6] px-4 py-3 text-[15px] text-[#212529]">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#cc0000]" />
        This page is unlisted but <strong>not password protected</strong> — anyone who knows the URL
        can change these settings. Keep the link private.
      </p>

      {error && (
        <p className="mt-5 flex max-w-3xl items-start gap-2 border border-[#cc0000]/40 bg-white px-4 py-3 text-[16px] text-[#cc0000]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-5 flex max-w-3xl items-start gap-2 border border-[#dddddd] bg-[#eff2f6] px-4 py-3 text-[16px] text-[#212529]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#cc0000]" />
          {notice}
        </p>
      )}

      {loading && (
        <p className="mt-8 flex items-center gap-2 text-[17px] text-[#6c757d]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}

      {/* Uploaded folders */}
      <section className="mt-12 max-w-3xl">
        <h2 className="h3-common">Uploaded folders</h2>
        {!data || data.folders.length === 0 ? (
          <p className="mt-3 text-[17px] text-[#6c757d]">
            Nothing has been added through the upload page yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[#dddddd] border border-[#dddddd]">
            {data.folders.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[17px] text-[#212529]">
                    {f.label}
                    {f.fromEnv && (
                      <span className="ml-2 border border-[#dddddd] px-2 py-0.5 text-[12px] uppercase tracking-[0.1em] text-[#6c757d]">
                        env
                      </span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-[13px] text-[#6c757d]">{f.id}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    onClick={() => call('DELETE', { id: f.id }, `rm-${f.id}`)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 border border-[#dddddd] px-3 py-1.5 text-[15px] text-[#cc0000] transition-colors hover:border-[#cc0000] hover:bg-[#cc0000] hover:text-white disabled:opacity-40"
                  >
                    {busy === `rm-${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Remove
                  </button>
                  <button
                    onClick={() => call('POST', { id: f.id, label: f.label }, `bl-${f.id}`)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 border border-[#dddddd] px-3 py-1.5 text-[15px] text-[#212529] transition-colors hover:border-[#212529] hover:bg-[#212529] hover:text-white disabled:opacity-40"
                  >
                    <Ban className="h-4 w-4" />
                    Block
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Block a folder */}
      <section className="mt-12 max-w-3xl">
        <h2 className="h3-common">Block a folder</h2>
        <p className="mt-2 text-[17px] text-[#6c757d]">
          Paste a Drive folder link or an album id. A blocked folder is hidden from the gallery and
          cannot be re-added from the upload page.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!blockInput.trim()) return;
            call('POST', { link: blockInput, id: undefined }, 'block-new').then(() => setBlockInput(''));
          }}
        >
          <input
            value={blockInput}
            onChange={(e) => setBlockInput(e.target.value)}
            placeholder="Drive folder link or album id"
            className="gk-field flex-1"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={busy !== null || !blockInput.trim()} className="gk-btn gk-btn-dark disabled:opacity-50">
            {busy === 'block-new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Block
          </button>
        </form>

        {data && data.albums.length > 0 && (
          <div className="mt-4">
            <label className="gk-label" htmlFor="album-pick">
              …or pick an album currently in the gallery
            </label>
            <select
              id="album-pick"
              className="gk-field"
              defaultValue=""
              onChange={(e) => {
                const album = data.albums.find((a) => a.id === e.target.value);
                if (album) call('POST', { id: album.id, label: album.name }, `block-${album.id}`);
                e.target.value = '';
              }}
              disabled={busy !== null}
            >
              <option value="">Select an album to block…</option>
              {data.albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Blocked list */}
      <section className="mt-12 max-w-3xl">
        <h2 className="h3-common">Blocked folders</h2>
        {!data || data.blocked.length === 0 ? (
          <p className="mt-3 text-[17px] text-[#6c757d]">Nothing is blocked.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#dddddd] border border-[#dddddd]">
            {data.blocked.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[17px] text-[#212529]">
                    {f.label}
                    {f.fromEnv && (
                      <span className="ml-2 border border-[#dddddd] px-2 py-0.5 text-[12px] uppercase tracking-[0.1em] text-[#6c757d]">
                        env
                      </span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-[13px] text-[#6c757d]">{f.id}</span>
                </span>
                <button
                  onClick={() => call('DELETE', { id: f.id, action: 'unblock' }, `ub-${f.id}`)}
                  disabled={busy !== null}
                  className="inline-flex shrink-0 items-center gap-1.5 border border-[#dddddd] px-3 py-1.5 text-[15px] text-[#212529] transition-colors hover:border-[#212529] hover:bg-[#212529] hover:text-white disabled:opacity-40"
                >
                  {busy === `ub-${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Permanence */}
      {data && (data.env.extra || data.env.blocked) && (
        <section className="mt-12 max-w-3xl border border-[#dddddd] bg-[#eff2f6] p-5">
          <h2 className="h4-common">Make these permanent on Vercel</h2>
          <p className="mt-2 text-[16px] leading-[1.75] text-[#212529]">
            Vercel&rsquo;s filesystem is read-only and its instances restart freely, so changes made
            here can be lost on redeploy. Set these environment variables in your Vercel project and
            they are applied on every boot.
          </p>
          <EnvBlock name="EXTRA_DRIVE_FOLDER_IDS" value={data.env.extra} />
          <EnvBlock name="BLOCKED_DRIVE_FOLDER_IDS" value={data.env.blocked} />
        </section>
      )}
    </div>
  );
}
