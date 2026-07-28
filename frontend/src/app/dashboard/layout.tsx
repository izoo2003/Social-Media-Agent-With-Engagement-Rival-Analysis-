'use client';

import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Menu, PanelLeftClose, X } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { ThemeToggle } from '@/components/ThemeToggle';
import DashboardAuthGate from '@/components/DashboardAuthGate';
import { logout } from '@/lib/auth';
import {
  type AccessTier,
  getAppSubtitle,
  getNavItems,
  getTierLabel,
  isJuniorTier,
} from '@/lib/app-mode';

interface DashboardLayoutProps {
  children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'kafi-sidebar-collapsed';

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [accessTier, setAccessTier] = useState<AccessTier>('senior');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleAuthenticated = useCallback((tier: AccessTier) => {
    setAccessTier(tier);
  }, []);

  const navItems = getNavItems(accessTier);
  const junior = isJuniorTier(accessTier);
  const appSubtitle = getAppSubtitle(accessTier);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  // Close the mobile drawer when the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  const renderSidebar = (opts?: { showClose?: boolean; desktop?: boolean }) => (
    <>
      <div className="p-4 sm:p-5 border-b border-brand-800">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="bg-white rounded-lg p-3 flex items-center justify-center flex-1">
            <Image
              src="/kafi-logo.png"
              alt="Kafi Commodities"
              width={180}
              height={60}
              className="object-contain w-full h-auto max-h-14"
              priority
            />
          </div>
          {opts?.showClose ? (
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg p-2 text-white/80 hover:bg-brand-800 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
          {opts?.desktop ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded-lg p-2 text-white/80 hover:bg-brand-800 hover:text-white"
              aria-label="Close sidebar"
              title="Hide sidebar for full view"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        <h2 className="text-sm font-semibold tracking-wide text-center text-white/90 uppercase">
          {appSubtitle}
        </h2>
        {junior && (
          <p className="mt-2 text-center text-xs text-gold-200">
            {getTierLabel('junior')} mode
          </p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          if (item.locked) {
            return (
              <div
                key={item.href}
                title="Senior access only — use a senior developer account to open this section"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-l-4 border-transparent text-white/40 cursor-not-allowed select-none"
              >
                <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span>{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-4 ${
                isActive
                  ? 'border-gold-400 bg-brand-800/60 text-gold-300'
                  : 'border-transparent text-white/85 hover:bg-brand-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 sm:p-4 border-t border-brand-800 space-y-2">
        <ThemeToggle
          className="w-full justify-center border-white/20 bg-brand-800/60 text-white hover:bg-brand-800 dark:border-white/20 dark:bg-brand-800/60 dark:text-white dark:hover:bg-brand-800"
        />
        {!junior && (
          <Link
            href="/dashboard/settings"
            className="block px-4 py-2 rounded-lg text-sm text-white/70 hover:bg-brand-800 hover:text-white transition-colors"
          >
            Settings
          </Link>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-full text-left px-4 py-2 rounded-lg text-sm text-white/70 hover:bg-brand-800 hover:text-white transition-colors"
        >
          Sign out
        </button>
        <p className="px-4 pt-2 text-center leading-snug">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-white/45">
            Social Media Agent
          </span>
          <span className="mt-0.5 block text-xs text-white/45">
            by <span className="font-semibold text-white">Izaan Bin Mujeeb</span>
          </span>
          <span className="mt-0.5 block text-[11px] text-white/45">Kafi Commodities</span>
        </p>
      </div>
    </>
  );

  return (
    <DashboardAuthGate onAuthenticated={handleAuthenticated}>
      <div className="flex h-[100dvh] min-h-0 bg-slate-50 dark:bg-slate-950">
        <Toaster position="top-right" />

        {/* Desktop sidebar */}
        {!sidebarCollapsed && (
          <aside className="hidden md:flex w-56 lg:w-64 shrink-0 bg-brand-900 text-white shadow-lg flex-col">
            {renderSidebar({ desktop: true })}
          </aside>
        )}

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close menu overlay"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,86vw)] max-w-full flex-col bg-brand-900 text-white shadow-2xl safe-area-pad">
              {renderSidebar({ showClose: true })}
            </aside>
          </div>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Open sidebar / menu — shown on mobile always, and on desktop when collapsed */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
                setCollapsed(false);
              } else {
                setMobileNavOpen(true);
              }
            }}
            className={`fixed left-3 top-3 z-40 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2.5 text-slate-700 shadow-md hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${
              sidebarCollapsed ? '' : 'md:hidden'
            }`}
            aria-label="Open menu"
            title="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div
            className={`flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-4 md:p-6 ${
              sidebarCollapsed ? 'pt-14' : 'max-md:pt-14'
            }`}
          >
            {children}
          </div>
        </main>
      </div>
    </DashboardAuthGate>
  );
}
