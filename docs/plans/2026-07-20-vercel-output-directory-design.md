# Vercel output directory fix

## Problem

The Vercel project uses `apps/web` as its root directory. The repository config
also sets the output directory to `apps/web/.next`, so Vercel looks for the
build output at `apps/web/apps/web/.next` even though Next.js writes it to
`apps/web/.next`.

## Design

Set `outputDirectory` to `.next`, relative to the configured Vercel project
root. Keep the existing install command, build command, framework selection,
and function duration settings unchanged.

## Verification

Run the web workspace's production build and confirm that `.next` is generated
under `apps/web`.
