"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Menu,
  Moon,
  Sun,
  Bell,
  Settings,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { ROUTES } from "@/components/ndr/command-palette";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/ndr/command-palette";
import { EnrollTotpDialog } from "@/components/ndr/enroll-totp-dialog";
import { canAccessModule, clearSession, useSessionUser } from "@/lib/session";
import * as React from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [totpOpen, setTotpOpen] = React.useState(false);
  const user = useSessionUser();
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!mounted) return;
    const saved = localStorage.getItem("spiderx_sidebar");
    if (saved === "collapsed") setSidebarOpen(false);
  }, [mounted]);

  /** The palette owns the ⌘K listener on window; replay the chord to open it. */
  function openPalette() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );
  }

  function toggleSidebar() {
    setSidebarOpen((v) => {
      const next = !v;
      localStorage.setItem("spiderx_sidebar", next ? "open" : "collapsed");
      return next;
    });
  }

  const nav = ROUTES.filter((r) =>
    canAccessModule(user?.permissions, r.module),
  );
  const initials = (user?.user_name || user?.user_id || "SX")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden">
      <CommandPalette />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "hidden h-full shrink-0 flex-col border-r border-white/10 bg-black text-white transition-[width] duration-200 md:flex",
            sidebarOpen ? "w-[220px]" : "w-[68px]",
          )}
        >
          <div className="flex h-14 shrink-0 items-center border-b border-white/10 px-3">
            <Link
              href="/command"
              className={cn(
                "flex items-center overflow-hidden",
                !sidebarOpen && "w-full justify-center",
              )}
              aria-label="Home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  sidebarOpen
                    ? "/assets/vehereLogoRed.png"
                    : "/assets/Vehere_logo_about.svg"
                }
                alt="Vehere"
                className={cn(
                  "object-contain",
                  sidebarOpen ? "h-8 w-auto max-w-[150px]" : "h-8 w-8",
                )}
              />
            </Link>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 scroll-thin">
            {nav.map((r) => {
              const Icon = r.icon;
              const active = pathname.startsWith(r.href);
              const link = (
                <Link
                  href={r.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                    active
                      ? "bg-white/[0.07] font-medium text-white before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-full before:bg-primary"
                      : "text-white/50 hover:bg-white/[0.05] hover:text-white/90",
                    !sidebarOpen && "justify-center px-0",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {sidebarOpen && <span className="truncate">{r.label}</span>}
                </Link>
              );
              if (sidebarOpen) return <div key={r.href}>{link}</div>;
              return (
                <Tooltip key={r.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{r.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
          <div className="mt-auto shrink-0 border-t border-white/10">
            {sidebarOpen && (
              <div className="px-3 pt-2 text-[10px] text-white/35">
                {user?.user_id || "session"} · {user?.role_name || "—"}
              </div>
            )}
            <div
              className={cn(
                "flex items-center p-2",
                sidebarOpen ? "justify-end" : "justify-center",
              )}
            >
              <button
                type="button"
                onClick={toggleSidebar}
                className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-black/90 px-3 text-white backdrop-blur md:px-5">
            <button
              className="rounded-md p-2 text-white/70 hover:bg-white/10 md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0">
              <div className="truncate">
                <span className="text-[17px] font-semibold leading-none tracking-tight">SpiderX</span>
                <span className="mx-2 text-white/25">/</span>
                <span className="text-sm font-medium text-white/85">
                  {ROUTES.find((r) => pathname.startsWith(r.href))?.label ??
                    "Console"}
                </span>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={openPalette}
                className="mr-1 hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] py-1.5 pl-2.5 pr-2 text-[12px] text-white/45 transition-colors hover:border-white/20 hover:text-white/70 lg:flex"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="w-28 text-left">Search</span>
                <kbd className="rounded border border-white/15 px-1 font-mono text-[10px] text-white/40">
                  ⌘K
                </kbd>
              </button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {mounted && theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:bg-white/10 hover:text-white"
                asChild
                aria-label="About"
              >
                <Link href="/about">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-1 rounded-full focus:outline-none focus:ring-2 focus:ring-primary">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/30 text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="text-sm">
                      {user?.user_name || user?.user_id || "Session"}
                    </div>
                    <div className="text-[11px] font-normal text-muted-foreground">
                      {user?.role_name || ""}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTotpOpen(true)}>
                    <Shield className="h-4 w-4" /> Authenticator (TOTP)
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/about">About SpiderX</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      clearSession();
                      router.push("/login");
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <EnrollTotpDialog
            open={totpOpen}
            onOpenChange={setTotpOpen}
            userId={user?.user_id}
          />

          {mobileOpen && (
            <div className="shrink-0 border-b border-border bg-card p-2 md:hidden">
              <div className="grid grid-cols-3 gap-1">
                {nav.map((r) => {
                  const Icon = r.icon;
                  const active = pathname.startsWith(r.href);
                  return (
                    <Link
                      key={r.href}
                      href={r.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md p-2 text-[10px]",
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {r.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
