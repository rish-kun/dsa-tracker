import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  // A brand-new account tracks nothing until the extension is installed and a
  // scoped API key is pasted into it, so send every signup to the walkthrough
  // rather than to an empty dashboard. `forceRedirectUrl` (not `fallback`) on
  // purpose: `/setup` outranks whatever deep link brought them here, and they
  // can reach it again from the dashboard notice.
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <SignUp forceRedirectUrl="/setup" />
    </main>
  );
}
