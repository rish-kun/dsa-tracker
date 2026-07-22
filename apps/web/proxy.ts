import { NextRequest, NextResponse } from 'next/server';

// Open CORS on /api/* — personal single-user project, no auth by design.
// Next 16 renamed the `middleware` file convention to `proxy`; this is the same
// interceptor, Node-runtime only (it never declared runtime: 'edge').
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function proxy(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const response = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
