import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set up the extension — DSA Tracker',
};

const RELEASES_URL = 'https://github.com/rish-kun/dsa-tracker-final/releases/latest';

/* ------------------------------------------------------------------ */
/* Local presentational pieces                                         */
/*                                                                     */
/* This page mixes the hand-written semantic classes (.page, .panel,   */
/* .panel-title) with Tailwind utilities on the same elements — the    */
/* stylesheet puts the semantic layer inside @layer components         */
/* specifically so utilities win, which is how the spacing overrides   */
/* below take effect.                                                  */
/* ------------------------------------------------------------------ */

/** Inline literal: a URL to paste, a filename, a UI label. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded-[4px] border border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-[5px] py-[2px] text-[12.5px] break-all"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </code>
  );
}

/** Tinted advisory box. Same border/background pairing as ExtensionKeyManager. */
function Callout({
  tone,
  title,
  children,
}: {
  tone: 'amber' | 'blue' | 'violet';
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="mt-3.5 rounded-[8px] border p-3 sm:p-3.5"
      style={{ borderColor: `var(--pt-${tone})`, background: `var(--pt-${tone}-bg)` }}
    >
      <p className="text-[13px] font-semibold tracking-[-0.01em]">{title}</p>
      <div className="mt-1 text-[13px] leading-[1.65] text-[var(--pt-text-2)]">{children}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="panel flex gap-3.5 sm:gap-5">
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--pt-blue-ring)] bg-[var(--pt-blue-bg)] text-[13px] font-semibold text-[var(--pt-blue-ink)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="panel-title mb-1.5 text-[16px]">{title}</h2>
        {children}
      </div>
    </li>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <p className="text-[13.5px] leading-[1.7] text-[var(--pt-text-2)]">{children}</p>;
}

const linkClass = 'text-[var(--pt-blue)] underline underline-offset-2';
const buttonLinkClass =
  'inline-block rounded-[6px] bg-[var(--pt-blue-bg)] px-3 py-2 text-[13px] font-medium text-[var(--pt-blue-ink)] no-underline';
const ghostLinkClass =
  'inline-block rounded-[6px] border border-[var(--pt-border-2)] px-3 py-2 text-[13px] font-medium no-underline';

const TROUBLESHOOTING: { symptom: string; fix: ReactNode }[] = [
  {
    symptom: '“This extension key was rejected or revoked”',
    fix: (
      <>
        The key was revoked, or it was mistyped or truncated when pasted. Create a fresh one on{' '}
        <Link href="/settings" className={linkClass}>
          Settings
        </Link>{' '}
        and paste it again — the secret is only ever shown at creation time.
      </>
    ),
  },
  {
    symptom: 'Both sync buttons are greyed out',
    fix: <>No key is connected yet. Finish step 4 — the popup enables them once a key verifies.</>,
  },
  {
    symptom: '“Open leetcode.com and log in first”',
    fix: (
      <>
        The import runs inside a tab of that site, so it needs one open and logged in. Open{' '}
        <Code>leetcode.com</Code> (or <Code>neetcode.io</Code>), sign in there, then press sync again.
      </>
    ),
  },
  {
    symptom: 'No banner on a takeuforward.org page',
    fix: <>Banners only activate on problem-looking pages. Articles, notes and index pages are skipped on purpose.</>,
  },
  {
    symptom: 'You solved something while offline',
    fix: (
      <>
        Nothing is lost. The extension queues solves it could not send and flushes them automatically on the next
        successful sync; the popup lists whatever is still pending.
      </>
    ),
  },
];

export default async function SetupPage() {
  await requireUser();

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Set up the extension</h1>
        <p className="page-subtitle">
          Nothing is tracked until the browser extension is installed and connected to your account. Six steps, about
          two minutes.
        </p>
      </div>

      <ol className="flex list-none flex-col gap-3.5 p-0">
        <Step n={1} title="Create an extension API key">
          <Body>
            The extension signs its requests with a key minted from your account. Open Settings and click{' '}
            <strong className="font-semibold text-[var(--pt-text)]">Create key</strong>. Keys are scoped to this
            tracker and grant access to nothing else.
          </Body>
          <Callout tone="amber" title="The secret is shown exactly once">
            It cannot be retrieved later — copy it somewhere safe before you leave that page. If you lose it, create a
            new key and revoke the old one. There is no way to recover an existing secret.
          </Callout>
          <div className="mt-3.5">
            <Link href="/settings" className={buttonLinkClass}>
              Open Settings
            </Link>
          </div>
        </Step>

        <Step n={2} title="Download the extension">
          <Body>
            Grab the newest build from GitHub Releases. The asset you want is named{' '}
            <Code>dsa-tracker-extension-&lt;version&gt;-chrome.zip</Code>. Unzip it, and keep the resulting folder
            somewhere permanent — the browser loads the extension from that path every time it starts.
          </Body>
          <Callout tone="amber" title="manifest.json must sit at the root of the folder you select">
            After unzipping you may end up with a wrapper folder that contains another folder. Select the one that has{' '}
            <Code>manifest.json</Code> directly inside it. Picking the parent folder by mistake is the single most
            common reason “Load unpacked” fails.
          </Callout>
          <div className="mt-3.5">
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className={buttonLinkClass}>
              Latest release on GitHub
            </a>
          </div>
        </Step>

        <Step n={3} title="Load it unpacked">
          <ol className="list-decimal space-y-2 pl-5 text-[13.5px] leading-[1.7] text-[var(--pt-text-2)] marker:text-[var(--pt-text-3)]">
            <li>
              Type or paste <Code>chrome://extensions</Code> into the address bar and press Enter. A link cannot
              navigate there — the browser blocks it, so you have to enter it yourself. (On Edge it is{' '}
              <Code>edge://extensions</Code>, on Brave <Code>brave://extensions</Code>.)
            </li>
            <li>
              Turn <strong className="font-semibold text-[var(--pt-text)]">Developer mode</strong> on, using the toggle
              in the top-right corner.
            </li>
            <li>
              Click <strong className="font-semibold text-[var(--pt-text)]">Load unpacked</strong> in the top-left, and
              select the unzipped folder from step 2.
            </li>
            <li>
              Pin the extension: click the puzzle-piece icon in the toolbar, then pin DSA Tracker so its icon stays
              visible. You will need that icon in the next two steps.
            </li>
          </ol>
          <Callout tone="violet" title="Chromium browsers only">
            Chrome, Edge, Brave and Helium all work. Firefox is not supported.
          </Callout>
        </Step>

        <Step n={4} title="Connect the key">
          <Body>
            Click the pinned extension icon, paste your key into the{' '}
            <strong className="font-semibold text-[var(--pt-text)]">Extension API key</strong> field, and click{' '}
            <strong className="font-semibold text-[var(--pt-text)]">Connect</strong>.
          </Body>
          <Callout tone="blue" title="How you know it is not connected yet">
            Until the key verifies, both sync buttons stay disabled, and problem pages show a “Connect your tracker”
            prompt where the banner would normally be.
          </Callout>
        </Step>

        <Step n={5} title="Import your existing history (one time)">
          <Body>
            This backfills everything you have already solved, so your dashboard does not start from zero.
          </Body>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13.5px] leading-[1.7] text-[var(--pt-text-2)] marker:text-[var(--pt-text-3)]">
            <li>
              Open <Code>leetcode.com</Code> in a tab and make sure you are logged in there. Then open the extension
              popup and click <strong className="font-semibold text-[var(--pt-text)]">Sync from LeetCode</strong>.
            </li>
            <li>
              Do the same for <Code>neetcode.io</Code>, then click{' '}
              <strong className="font-semibold text-[var(--pt-text)]">Sync from NeetCode</strong>.
            </li>
          </ol>
          <Callout tone="blue" title="Why it needs the tab open">
            The import runs inside that site&apos;s own tab, so its session cookies apply and the site answers as you.
            The tracker never sees your LeetCode or NeetCode credentials.
          </Callout>
        </Step>

        <Step n={6} title="You're done">
          <Body>
            From here it is automatic. An Accepted submission on LeetCode is recorded on its own, with nothing to
            click. On NeetCode, takeuforward.org and GeeksforGeeks — where there is no verdict to detect — a “Mark as
            completed?” banner appears on problem pages, and one click records it.
          </Body>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Link href="/" className={buttonLinkClass}>
              Go to dashboard
            </Link>
            <Link href="/problems" className={ghostLinkClass}>
              Browse solved problems
            </Link>
          </div>
        </Step>
      </ol>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Troubleshooting</h2>
          <p className="panel-subtitle">The five things that actually go wrong</p>
        </div>
        <dl className="flex flex-col divide-y divide-[var(--pt-border)]">
          {TROUBLESHOOTING.map((item) => (
            <div key={item.symptom} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-[13.5px] font-semibold tracking-[-0.01em]">{item.symptom}</dt>
              <dd className="mt-1 text-[13.5px] leading-[1.7] text-[var(--pt-text-2)]">{item.fix}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-[12.5px] leading-[1.7] text-[var(--pt-text-3)]">
        Note: the day-by-day study plan at <Code>/plan</Code> is restricted to the maintainer&apos;s account, so it will
        not appear in the nav for most users. Everything else on this page applies to everyone.
      </p>
    </main>
  );
}
