import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ExtensionKeyManager } from '@/components/ExtensionKeyManager';
import { listExtensionKeys } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireUser();
  const keys = await listExtensionKeys();
  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Create an extension API key, copy it once, and revoke it here when needed. New to this?{' '}
          <Link href="/setup" className="text-[var(--pt-blue)]">
            Follow the setup guide
          </Link>
          .
        </p>
      </div>
      <ExtensionKeyManager initialKeys={keys} />
    </main>
  );
}
