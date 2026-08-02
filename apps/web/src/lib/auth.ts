import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/** The sole account allowed to use the private study-plan workspace. */
export const PLAN_OWNER_EMAIL = 'f20240606@pilani.bits-pilani.ac.in';
export const EXTENSION_SCOPE = 'dsa-tracker:extension';

function normalEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/** Require an interactive Clerk session for Server Components and Actions. */
export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');
  return userId;
}

/**
 * Server-side policy for the plan. Clerk only exposes verified email addresses
 * as primaryEmailAddress / emailAddresses, so deliberately reject any user
 * without the exact verified account email instead of trusting a client claim.
 */
export async function isPlanUser(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses.some(
    (address) => address.verification?.status === 'verified' && normalEmail(address.emailAddress) === PLAN_OWNER_EMAIL,
  );
}

export async function requirePlanUser(): Promise<string> {
  const userId = await requireUser();
  if (!(await isPlanUser())) throw new Error('Plan access is not authorized for this account');
  return userId;
}

/** Route handlers turn this into a stable API response rather than leaking Clerk errors. */
export function unauthorizedApiResponse(message = 'A valid extension API key is required') {
  return NextResponse.json({ error: message }, {
    status: 401,
    headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' },
  });
}

/**
 * Verify an opaque Clerk user API key. A key must be explicitly minted by our
 * settings screen with the extension scope; generic user keys are rejected.
 */
export async function requireApiUser(request: Request): Promise<string | null> {
  const value = request.headers.get('authorization');
  const secret = value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!secret) return legacyApiUser();

  try {
    const client = await clerkClient();
    const apiKey = await client.apiKeys.verify(secret);
    if (
      !apiKey.subject ||
      apiKey.subject.startsWith('org_') ||
      apiKey.revoked ||
      apiKey.expired ||
      !apiKey.scopes.includes(EXTENSION_SCOPE)
    ) return null;
    return apiKey.subject;
  } catch {
    return null;
  }
}

/** Temporary migration bridge. It is intentionally only for a *missing* key. */
function legacyApiUser(): string | null {
  if (process.env.ALLOW_UNAUTHENTICATED_API !== 'true') return null;
  const legacyOwner = process.env.LEGACY_OWNER_USER_ID?.trim();
  return legacyOwner || null;
}
