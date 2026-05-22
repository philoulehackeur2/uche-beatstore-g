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
      <header className="fixed top-0 left-0 right-0 h-16 z-30 flex items-center px-5 md:px-8">
        {/* Left section - Brand + Navigation */}
        <div className="flex items-center gap-8 flex-1">
          {/* Mobile hamburger — visible below md, opens the slide-in menu */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden text-white/80 hover:text-white transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>

          {/* Brand */}
          <Link href="/library" className="flex items-center group shrink-0">
            <span className="text-xs md:text-sm font-medium uppercase tracking-[0.3em] text-white">
              U2C Beatstore
            </span>
          </Link>

          {/* Desktop nav — hidden below md (replaced by the mobile drawer) */}
          <nav className="hidden md:flex items-center gap-6 overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'text-[11px] font-medium uppercase tracking-[0.2em] transition-colors shrink-0',
                    active
                      ? 'text-white'
                      : 'text-white/50 hover:text-white',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right section - Actions */}
        <div className="flex items-center gap-5">
          {/* Search trigger */}
          <button
            onClick={() => openPalette(true)}
            className="text-white/50 hover:text-white transition-colors"
            title="Search (⌘K)"
            aria-label="Search"
          >
            <Search size={16} strokeWidth={1.5} />
          </button>

          {/* Activity bell */}
          <button
            onClick={() => setActivityOpen(true)}
            className="text-white/50 hover:text-white transition-colors"
            aria-label="Open activity"
            title="Activity"
          >
            <Bell size={16} strokeWidth={1.5} />
          </button>

          {/* User profile */}
          <Link
            href="/profile"
            aria-label="Creator profile"
            title="Profile"
            className={cn(
              'transition-colors',
              pathname === '/profile' || pathname.startsWith('/profile/')
                ? 'text-white'
                : 'text-white/50 hover:text-white',
            )}
          >
            <User size={16} strokeWidth={1.5} />
          </Link>
        </div>

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
            className="md:hidden fixed inset-0 bg-black/90 z-40 animate-in fade-in duration-200"
          />
          <aside
            className="md:hidden fixed top-0 left-0 bottom-0 w-72 z-50 bg-black flex flex-col animate-in slide-in-from-left duration-300"
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="text-sm font-medium uppercase tracking-[0.3em] text-white">
                Menu
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-white/50 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <nav className="flex-1 px-6 py-4 space-y-1 overflow-y-auto">
              {[...NAV_ITEMS, ...MOBILE_EXTRA_ITEMS].map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'block py-3 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors border-b border-white/10',
                      active
                        ? 'text-white'
                        : 'text-white/50 hover:text-white',
                    )}
                  >
                    {item.label}
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
