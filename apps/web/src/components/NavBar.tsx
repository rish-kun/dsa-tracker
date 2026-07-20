'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/problems', label: 'Problems' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-wordmark">
          <span className="nav-wordmark-dim">dsa</span>
          <span className="nav-wordmark-slash">/</span>
          <span>tracker</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link"
                data-active={active || undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
