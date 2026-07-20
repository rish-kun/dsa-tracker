import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DSA Tracker',
    description:
      'Tracks unique DSA questions solved across LeetCode, NeetCode, and Striver A2Z',
    // scripting + tabs: run the backfill collector inside a leetcode.com tab so
    // first-party session cookies apply (content scripts are CORS-bound).
    permissions: ['storage', 'alarms', 'webNavigation', 'scripting', 'tabs'],
    host_permissions: [
      '*://leetcode.com/*',
      '*://neetcode.io/*',
      '*://takeuforward.org/*',
      'http://localhost/*',
      'https://*.vercel.app/*',
    ],
    // The MAIN-world interceptor is injected via injectScript() and must be
    // reachable from the leetcode.com page context.
    web_accessible_resources: [
      {
        resources: ['leetcode-interceptor.js'],
        matches: ['*://leetcode.com/*'],
      },
    ],
  },
});
