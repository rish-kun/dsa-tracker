# API query reliability fix

## Problem

`GET /api/stats` starts seven database reads concurrently even though each
serverless function instance intentionally uses a single Postgres connection.
Against the Supabase transaction pooler, the query fan-out can stall that
connection and queue later requests behind it. Both stats endpoints also let
database/configuration errors escape as opaque HTML 500 responses.

## Design

- Keep the one-connection `postgres.js` client and transaction-pooler settings.
- Calculate both solved totals in one aggregate query using PostgreSQL filtered
  counts.
- Run the remaining stats reads sequentially so only one query is active on the
  client at a time.
- Catch endpoint failures, log the full server-side error, and return a stable
  JSON `{ error }` response without exposing credentials or connection strings.

## Verification

- Run the web TypeScript check and production build.
- Start one clean local web server and call `/api/solved` and `/api/stats`.
- Confirm both return HTTP 200 with the expected response shapes against the
  configured Supabase database.
