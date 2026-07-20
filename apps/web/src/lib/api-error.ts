import { NextResponse } from 'next/server';

export function publicErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown server error';

  // Database drivers can include a connection URI in parsing errors. Preserve
  // the actionable message while ensuring credentials never reach the client.
  return error.message.replace(
    /postgres(?:ql)?:\/\/\S+/gi,
    '[redacted database URL]',
  );
}

export function apiErrorResponse(route: string, error: unknown) {
  const message = publicErrorMessage(error);

  // Logging an Error object directly can print driver-specific properties such
  // as `input`, which Node's URL parser fills with the complete connection URI.
  console.error(`${route} failed: ${message}`);
  return NextResponse.json({ error: message }, { status: 500 });
}
