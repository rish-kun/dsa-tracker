'use client';

import { useState, useTransition } from 'react';
import { createExtensionKey, revokeExtensionKey, type ExtensionKey } from '../../app/settings/actions';

function date(value: number | Date | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function ExtensionKeyManager({ initialKeys }: { initialKeys: ExtensionKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const created = await createExtensionKey('Browser extension');
      setSecret(created.secret);
      setKeys((current) => [{ id: created.id, name: 'Browser extension', createdAt: new Date(), lastUsedAt: null, revoked: false }, ...current]);
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      await revokeExtensionKey(id);
      setKeys((current) => current.map((key) => key.id === id ? { ...key, revoked: true } : key));
    });
  }

  return (
    <section className="rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Browser extension API keys</h2>
          <p className="mt-1 text-sm text-[var(--pt-text-2)]">Keys are scoped to this tracker and shown only once.</p>
        </div>
        <button type="button" onClick={create} disabled={pending} className="rounded bg-[var(--pt-blue-bg)] px-3 py-2 text-sm font-medium text-[var(--pt-blue-ink)] disabled:opacity-60">
          Create key
        </button>
      </div>
      {secret && <div className="mt-4 rounded border border-[var(--pt-amber)] bg-[var(--pt-amber-bg)] p-3 text-sm"><p className="font-medium">Copy this key now — it cannot be shown again.</p><code className="mt-2 block break-all">{secret}</code><button type="button" onClick={() => setSecret(null)} className="mt-2 underline">I copied it</button></div>}
      <ul className="mt-4 divide-y divide-[var(--pt-border)]">
        {keys.length === 0 && <li className="py-3 text-sm text-[var(--pt-text-2)]">No extension keys yet.</li>}
        {keys.map((key) => <li key={key.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{key.name}</p><p className="text-[var(--pt-text-2)]">Created {date(key.createdAt)} · Last used {date(key.lastUsedAt)}</p></div>{key.revoked ? <span className="text-[var(--pt-rose)]">Revoked</span> : <button type="button" disabled={pending} onClick={() => revoke(key.id)} className="text-[var(--pt-rose)] underline">Revoke</button>}</li>)}
      </ul>
    </section>
  );
}
