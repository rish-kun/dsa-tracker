import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'DSA Tracker',
    description:
      'Tracks unique DSA questions solved across LeetCode, NeetCode, Striver A2Z, and GeeksforGeeks',
    // scripting + tabs: run history collectors inside LeetCode/NeetCode tabs
    // so each collector can use the site's first-party login session.
    permissions: ['storage', 'alarms', 'webNavigation', 'scripting', 'tabs'],
    host_permissions: [
      '*://leetcode.com/*',
      '*://neetcode.io/*',
      '*://takeuforward.org/*',
      '*://geeksforgeeks.org/*',
      '*://www.geeksforgeeks.org/*',
      '*://practice.geeksforgeeks.org/*',
      'http://localhost/*',
      'https://*.vercel.app/*',
    ],
  },
});
