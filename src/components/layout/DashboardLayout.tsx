'use client';

// DashboardLayout is a simple pass-through wrapper. The real chrome
// (sidebar + player) lives in the root layout. Individual pages provide
// their own headers and chrome so they can feel distinct.
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full">{children}</div>;
}
