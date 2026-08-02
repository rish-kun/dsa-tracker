import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { NavBar } from '@/components/NavBar';
import { isPlanUser, requireUser } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DSA Tracker',
  description: 'Unique DSA questions solved across LeetCode, NeetCode, GeeksforGeeks, and Striver A2Z',
};

/**
 * Runs before first paint so the resolved theme is on <html> by the time any
 * pixel is drawn. Without this the theme would be resolved in a client effect,
 * which paints the default theme first and flashes on every load.
 */
const themeScript = `(function(){try{var s=localStorage.getItem('pt_theme');var d=(s==='dark'||s==='light')?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The proxy redirects anonymous document requests before this layout runs;
  // keeping the resource check here protects layouts rendered outside proxy.
  let signedIn = false;
  let canUsePlan = false;
  try {
    await requireUser();
    signedIn = true;
    canUsePlan = await isPlanUser();
  } catch {
    // Auth pages intentionally render without application navigation.
  }
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: 'var(--pt-blue)',
              colorBackground: 'var(--pt-surface)',
              colorText: 'var(--pt-text)',
              colorInputBackground: 'var(--pt-surface)',
              colorInputText: 'var(--pt-text)',
              colorNeutral: 'var(--pt-text-2)',
              borderRadius: '6px',
            },
          }}
        >
          <ThemeProvider>
            {signedIn && <NavBar canUsePlan={canUsePlan} />}
            {children}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
