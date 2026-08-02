'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { EXTENSION_SCOPE, requireUser } from '@/lib/auth';

export type ExtensionKey = {
  id: string;
  name: string;
  createdAt: number | Date;
  lastUsedAt: number | Date | null;
  revoked: boolean;
};

export async function listExtensionKeys(): Promise<ExtensionKey[]> {
  const userId = await requireUser();
  const client = await clerkClient();
  const response = await client.apiKeys.list({ subject: userId, includeInvalid: true });
  return response.data
    .filter((key) => key.scopes.includes(EXTENSION_SCOPE))
    .map((key) => ({
      id: key.id,
      name: key.name,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revoked: key.revoked,
    }));
}

/** Returned secret exists only for this invocation; the client shows it once. */
export async function createExtensionKey(name: string): Promise<{ id: string; secret: string }> {
  const userId = await requireUser();
  const normalized = name.trim().slice(0, 80) || 'Browser extension';
  const client = await clerkClient();
  const key = await client.apiKeys.create({
    name: normalized,
    description: 'DSA Tracker browser extension',
    subject: userId,
    createdBy: userId,
    scopes: [EXTENSION_SCOPE],
  });
  if (!key.secret) throw new Error('Clerk did not return the newly created key secret');
  revalidatePath('/settings');
  return { id: key.id, secret: key.secret };
}

export async function revokeExtensionKey(apiKeyId: string): Promise<void> {
  const userId = await requireUser();
  const client = await clerkClient();
  const keys = await client.apiKeys.list({ subject: userId, includeInvalid: true });
  const target = keys.data.find((key) => key.id === apiKeyId && key.scopes.includes(EXTENSION_SCOPE));
  if (!target) throw new Error('Extension API key not found');
  await client.apiKeys.revoke({ apiKeyId, revocationReason: 'revoked from DSA Tracker settings' });
  revalidatePath('/settings');
}
