import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Database, Map as MapIcon, Menu, Moon, Route as RouteIcon, Sun, X } from "lucide-react";
import { getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Workspace", icon: MapIcon },
  { href: "/sources", label: "Integrations", icon: Database },
  { href: "/roadmap", label: "Roadmap & Method", icon: RouteIcon },
];

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="16" cy="16" rx="6" ry="13" fill="none" stroke="currentColor" strokeWidth="1" opacity=".6" />
      <path d="M3 16h26" stroke="currentColor" strokeWidth="1" opacity=".6" />
      <path d="M6 22 L11 17 L15 19 L20 11 L26 14" fill="none" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Health() {
  const h = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000, retry: 1 } });
  const ok = h.data?.status?.toLowerCase() === "ok";
  return (
    <button data-testid="status-health" onClick={() => h.refetch()} title="Click to re-check API health" className="w-full rounded-sm border border-sidebar-border px-2.5 py-2 text-left hover:bg-sidebar-accent">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
        <Activity className="h-3 w-3" /> API health
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className={cn("h-2 w-2 rounded-full", h.isLoading || h.isFetching ? "animate-pulse bg-sidebar-foreground/40" : h.isError ? "bg-red-400" : ok ? "bg-emerald-400" : "bg-amber-400")} />
        {h.isLoading ? "Checking..." : h.isError ? "Unreachable - click to retry" : `${h.data?.status} · ${h.data?.service}`}
      </div>
      {h.data && <div className="mt-0.5 truncate font-mono text-[10px] text-sidebar-foreground/50">{h.data.timestamp}</div>}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const { theme, toggle } = useTheme();
  const side = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Mark />
        <div>
          <div className="font-mono text-sm font-medium tracking-[0.22em]">Ecoscope</div>
          <div className="text-[10px] text-sidebar-foreground/55">Earth System Trend Detective</div>
        </div>
      </div>
      <div className="mx-4 mb-3 rounded-sm border border-sidebar-primary/40 bg-sidebar-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-sidebar-primary">Phase 2 · NASA POWER point data</div>
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV.map((n) => {
          const active = loc === n.href;
          return (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} data-testid={`link-nav-${n.label.split(" ")[0].toLowerCase()}`}
              className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_hsl(var(--sidebar-primary))]" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 p-3">
        <Health />
        <button data-testid="button-theme" onClick={toggle} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent">
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />} {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
        <p className="px-1 text-[10px] leading-relaxed text-sidebar-foreground/45">See the Planet. Detect the Trends. Understand the Change.</p>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 md:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-[1000] md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64" role="dialog" aria-modal="true" aria-label="Navigation">
            <button data-testid="button-close-menu" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute right-1 top-1 z-10 rounded-sm bg-sidebar p-1 text-sidebar-foreground"><X className="h-4 w-4" /></button>
            {side}
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-[900] flex items-center justify-between border-b bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden">
          <div className="flex items-center gap-2"><Mark /><span className="font-mono text-xs tracking-[0.2em]">Ecoscope</span></div>
          <button data-testid="button-menu" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-sm p-1.5 hover:bg-sidebar-accent">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
