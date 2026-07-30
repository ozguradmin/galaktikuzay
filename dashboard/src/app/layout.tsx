'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const navItems = [
  { href: '/', icon: '🏠', label: 'Ana Sayfa' },
  { href: '/posts', icon: '📝', label: 'Postlar' },
  { href: '/logs', icon: '📋', label: 'Loglar' },
  { href: '/settings', icon: '⚙️', label: 'Ayarlar' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <html lang="tr">
      <head>
        <title>Galaktik Uzay · Dashboard</title>
        <meta name="description" content="Galaktik Uzay otomatik yayın sistemi kontrol paneli" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <div className="app-wrapper">
          {/* Mobile Header */}
          <header className="mobile-header">
            <span className="mobile-logo">🚀 Galaktik Uzay</span>
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Menü"
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>
          </header>

          {/* Sidebar Overlay */}
          {sidebarOpen && (
            <div className="sidebar-overlay visible" onClick={closeSidebar} />
          )}

          {/* Layout */}
          <div className="layout">
            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
              <div className="sidebar-header">
                <Link href="/" className="sidebar-logo" onClick={closeSidebar}>
                  <span>🚀</span> Galaktik Uzay
                </Link>
              </div>

              <nav className="sidebar-nav">
                {navItems.map((item) => {
                  const isActive = item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeSidebar}
                      className={`nav-link ${isActive ? 'active' : ''}`}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-text">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="sidebar-footer">
                <p className="sidebar-version">v1.0.0 · Kontrol Paneli</p>
              </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
