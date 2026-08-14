import { clerkClient } from '@clerk/nextjs/server';
import { EXTENSION_SCOPE } from './auth';

/**
 * How far along a user is in connecting the browser extension.
 *
 * There is no way for a web page to detect the extension directly — it ships no
 * `web_accessible_resources` and is not in `externally_connectable`, both
 * deliberate. The observable proxy is the API key: the extension cannot call the
 * API without one, and Clerk stamps `lastUsedAt` the first time a key verifies.
 * So a key that exists but has never been used means the key was minted and the
 * extension never connected — installed-but-not-pasted, or not installed at all.
 */
export type ExtensionStatus = 'no-key' | 'key-unused' | 'connected';

/**
 * Read-only and deliberately non-throwing, like the `/plan` reads: a Clerk
 * outage must not take the dashboard down over a setup hint. On failure we
 * report `connected`, which renders nothing — a missing nudge beats a false one.
 */
export async function getExtensionStatus(userId: string): Promise<ExtensionStatus> {
  try {
    const client = await clerkClient();
    const response = await client.apiKeys.list({ subject: userId, includeInvalid: true });
    const keys = response.data.filter(
      (key) => key.scopes.includes(EXTENSION_SCOPE) && !key.revoked && !key.expired,
    );
    if (keys.length === 0) return 'no-key';
    return keys.some((key) => key.lastUsedAt) ? 'connected' : 'key-unused';
  } catch (error) {
    console.error('[extension-status] rendering without a setup hint', error);
    return 'connected';
  }
}
