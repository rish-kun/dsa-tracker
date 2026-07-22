import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { NavBar } from '@/components/NavBar';
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
  description: 'Unique DSA questions solved across LeetCode, NeetCode, and Striver A2Z',
};

/**
 * Runs before first paint so the resolved theme is on <html> by the time any
 * pixel is drawn. Without this the theme would be resolved in a client effect,
 * which paints the default theme first and flashes on every load.
 */
const themeScript = `(function(){try{var s=localStorage.getItem('pt_theme');var d=(s==='dark'||s==='light')?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <ThemeProvider>
          {/* NavBar reads useSearchParams (the /plan cockpit widens it), which
              Next requires a Suspense boundary around so a statically rendered
              route can still be prerendered. */}
          <Suspense fallback={<div className="h-[73px] border-b border-[var(--pt-border)]" />}>
            <NavBar />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
