'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Disc3,
  Layers,
  ListMusic,
  Users,
  Calendar,
  Link2,
  Settings,
  Search,
  Sliders,
  CloudOff,
  Bell,
  Menu,
  X,
  User,
} from 'lucide-react';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { ActivityPanel } from '@/components/activity/ActivityPanel';
import { cn } from '@/lib/utils';

// Settings is intentionally NOT in this list — it moved to a dedicated
// gear button in the top-right (next to the activity bell) so the
// horizontal nav is reserved for surfaces the user reaches every day.
// Mobile drawer still has it for the same reason it has Offline:
// long-tail destinations the user does want eventually.
const NAV_ITEMS = [
  { label: 'Library',   icon: Disc3,     href: '/library'   },
  { label: 'Projects',  icon: Layers,    href: '/projects'  },
  { label: 'Playlists', icon: ListMusic, href: '/playlists' },
  { label: 'Studio',    icon: Sliders,   href: '/studio'    },
  { label: 'Contacts',  icon: Users,     href: '/contacts'  },
  { label: 'Calendar',  icon: Calendar,  href: '/calendar'  },
  { label: 'Links',     icon: Link2,     href: '/links'     },
  { label: 'Offline',   icon: CloudOff,  href: '/offline'   },
];

// Mobile drawer keeps Settings reachable since there's no gear icon
// in the cramped mobile header.
const MOBILE_EXTRA_ITEMS = [
  { label: 'Profile',   icon: User,      href: '/profile'   },
  { label: 'Settings',  icon: Settings,  href: '/settings'  },
];

export function TopBar() {
  const pathname = usePathname();
  const openPalette = useCommandPalette((s) => s.setOpen);
  // Activity panel — was previously wired into the unmounted Sidebar,
  // moved here so the bell is actually visible. State stays local;
  // the panel itself portals to <body> at render time.
  const [activityOpen, setActivityOpen] = useState(false);
  // Mobile menu drawer. Closed by default; opens on hamburger tap and
  // closes on route change so navigating doesn't leave the drawer
  // stuck open over the new page.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-black border-b-2 border-white z-30 flex items-center px-4 md:px-8 gap-3 md:gap-8">
        {/* Mobile hamburger — visible below md, opens the slide-in menu */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden w-8 h-8 flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white"
          aria-label="Open navigation menu"
        >
          <Menu size={16} strokeWidth={2} />
        </button>

        {/* Brand */}
        <Link href="/library" className="flex items-center gap-3 group shrink-0">
          <div className="w-7 h-7 border-2 border-white flex items-center justify-center bg-black">
            <span className="text-xs font-black text-white tracking-widest">U2C</span>
          </div>
          <span className="text-xs font-bold tracking-[0.3em] uppercase text-white hidden sm:inline border-l-2 border-white pl-3">
            Beatstore
          </span>
        </Link>

        {/* Desktop nav — hidden below md (replaced by the mobile drawer) */}
        <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors shrink-0 border',
                  active
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent text-white border-white/40 hover:border-white',
                )}
              >
                <Icon size={12} strokeWidth={2.5} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Spacer — only when mobile nav is hidden so the right-side
            controls hug the right edge instead of left-floating. */}
        <div className="flex-1 md:hidden" />

        {/* Search trigger — hidden below md to save horizontal room.
            Mobile users can still hit ⌘K / Ctrl+K. */}
        <button
          onClick={() => openPalette(true)}
          className="hidden md:flex items-center gap-2 w-48 bg-black border-2 border-white py-1.5 px-3 text-xs text-white hover:bg-white/5 transition-colors shrink-0 font-bold uppercase tracking-widest"
          title="Search (⌘K)"
        >
          <Search size={12} strokeWidth={2.5} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[9px] font-mono border border-white px-1.5 py-0.5 text-white">⌘K</kbd>
        </button>

        {/* Activity bell — opens the slide-in activity panel. Shown at
            every breakpoint; mobile users want this just as much. */}
        <button
          onClick={() => setActivityOpen(true)}
          className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 transition-colors shrink-0 border border-white/40 hover:border-white"
          aria-label="Open activity"
          title="Activity"
        >
          <Bell size={12} strokeWidth={2.5} />
        </button>

        {/* Settings gear — moved out of the horizontal nav so it lives
            next to the activity bell on every page. Desktop only;
            mobile users reach it via the drawer below. The active
            state ring makes it clear when the user IS on /settings. */}
        <Link
          href="/settings"
          aria-label="Open settings"
          title="Settings"
          className={cn(
            'hidden md:flex w-8 h-8 items-center justify-center transition-colors shrink-0 border',
            pathname === '/settings' || pathname.startsWith('/settings/')
              ? 'bg-white border-white text-black'
              : 'bg-black border-white/40 text-white hover:border-white',
          )}
        >
          <Settings size={12} strokeWidth={2.5} />
        </Link>

        {/* User badge — links to creator profile */}
        <Link
          href="/profile"
          aria-label="Creator profile"
          title="Profile"
          className={cn(
            'flex items-center gap-2 shrink-0 w-8 h-8 transition-colors border',
            pathname === '/profile' || pathname.startsWith('/profile/')
              ? 'bg-white border-white text-black'
              : 'bg-black border-white text-white hover:bg-white/10',
          )}
        >
          <div className="w-full h-full flex items-center justify-center">
            <User size={12} strokeWidth={2.5} />
          </div>
        </Link>

        <style jsx>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </header>

      {/* Mobile menu drawer — slide-in from the left below md.
          Backdrop is a darkened glass overlay; clicking it closes. */}
      {mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            className="md:hidden fixed inset-0 bg-black/70 z-40 animate-in fade-in duration-200"
          />
          <aside
            className="md:hidden fixed top-0 left-0 bottom-0 w-72 z-50 bg-black border-r-2 border-white flex flex-col animate-in slide-in-from-left duration-300"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b-2 border-white">
              <span className="text-xs font-bold tracking-[0.3em] uppercase text-white">
                Beatstore
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/10 transition-colors border border-white/40 hover:border-white"
                aria-label="Close menu"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {[...NAV_ITEMS, ...MOBILE_EXTRA_ITEMS].map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors border',
                      active
                        ? 'bg-white text-black border-white'
                        : 'text-white border-white/40 hover:border-white',
                    )}
                  >
                    <Icon size={14} strokeWidth={2.5} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />
    </>
  );
}
