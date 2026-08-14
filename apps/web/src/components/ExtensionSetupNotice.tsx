import Link from 'next/link';
import type { ExtensionStatus } from '@/lib/extension-status';

/**
 * Shown on the dashboard until the extension has actually called the API once.
 * `connected` renders nothing, so this disappears on its own the first time a
 * key verifies — there is no dismiss button to get wrong.
 */
export function ExtensionSetupNotice({ status }: { status: ExtensionStatus }) {
  if (status === 'connected') return null;

  const isMissingKey = status === 'no-key';
  // Blue for "here is your next step", amber for "something is half-done".
  const tone = isMissingKey ? 'blue' : 'amber';

  return (
    <section
      className="mb-6 rounded-[10px] border p-4 sm:p-5"
      style={{
        borderColor: `var(--pt-${tone})`,
        background: `var(--pt-${tone}-bg)`,
      }}
    >
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
        {isMissingKey ? 'Finish setting up the extension' : 'The extension has not connected yet'}
      </h2>
      <p className="mt-1.5 text-[13.5px] text-[var(--pt-text-2)]">
        {isMissingKey
          ? 'Nothing is tracked until the browser extension is installed and connected to your account. It takes about two minutes.'
          : 'You have an API key, but it has never been used. Install the extension if you have not already, then paste the key into its popup and click Connect. If you lost the key, create a new one — it is only shown once.'}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        <Link
          href="/setup"
          className="rounded-[6px] bg-[var(--pt-blue-bg)] px-3 py-2 text-[13px] font-medium text-[var(--pt-blue-ink)] no-underline"
        >
          {isMissingKey ? 'Set up the extension' : 'Open setup guide'}
        </Link>
        <Link
          href="/settings"
          className="rounded-[6px] border border-[var(--pt-border-2)] px-3 py-2 text-[13px] font-medium no-underline"
        >
          Manage API keys
        </Link>
      </div>
    </section>
  );
}
