import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/__clerk'];

export default clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  // API handlers authenticate opaque extension keys themselves. Keeping them
  // outside session redirects preserves a stable JSON 401 contract.
  if (path.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  const { userId } = await auth();
  if (!userId) {
    const url = new URL('/sign-in', request.url);
    url.searchParams.set('redirect_url', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
