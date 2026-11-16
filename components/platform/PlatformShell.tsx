"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Layers,
  ShieldAlert,
  LogOut,
  LayoutDashboard,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface PlatformShellProps {
  children: React.ReactNode;
}

export function PlatformShell({ children }: PlatformShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Automatically close mobile drawer when navigating
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/platform-login");
    router.refresh();
  }

  const navItems = [
    { label: "Overview", href: "/platform", icon: LayoutDashboard },
    { label: "Societies & Quotas", href: "/platform/societies", icon: Building2 },
    { label: "Plans & Billing", href: "/platform/plans", icon: Layers },
  ];

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full text-zinc-700 dark:text-zinc-300">
      <div>
        {/* Brand */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-950 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-950 font-bold text-sm tracking-wider">
              SB
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-950 dark:text-white tracking-tight leading-none">
                SocietyBook
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                Super Admin Console
              </div>
            </div>
          </div>
          {mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 md:hidden"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="px-3 py-6 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Platform Operator
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800/90 text-zinc-950 dark:text-white shadow-2xs font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer controls */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
        <a
          href="/admin"
          className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            Society Portal Preview
          </span>
          <ExternalLink className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
        </a>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out Operator
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex antialiased selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors">
      {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
      <aside className="hidden md:flex md:w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-col shrink-0 min-h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop and Slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-zinc-950 shadow-2xl z-10 flex flex-col h-full border-r border-zinc-200 dark:border-zinc-800">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 px-4 sm:px-6 md:px-8 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Hamburger button on phone */}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white md:hidden transition-colors"
              aria-label="Open mobile navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile Brand / Desktop Title */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-zinc-950 dark:bg-zinc-100 flex md:hidden items-center justify-center text-white dark:text-zinc-950 font-bold text-xs tracking-wider shrink-0">
                SB
              </div>
              <div className="md:hidden flex flex-col leading-none">
                <span className="text-xs font-semibold text-zinc-950 dark:text-white">
                  SocietyBook
                </span>
                <span className="text-[9px] font-mono text-zinc-500 mt-0.5">
                  Super Admin
                </span>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  Platform Operator Session
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

