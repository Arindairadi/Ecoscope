import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusTag({ status, className }: { status: string; className?: string }) {
  const s = status.toLowerCase();
  const tone =
    s === "ok" || s === "connected" || s === "operational" || s === "available" || s === "complete"
      ? "border-primary/40 text-primary bg-primary/10"
      : s.includes("error") || s.includes("fail") || s === "unavailable"
        ? "border-destructive/40 text-destructive bg-destructive/10"
        : "border-accent/40 text-accent bg-accent/10";
  return (
    <span data-testid={`status-${s}`} className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", tone, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ErrorPanel({ title, error, onRetry, retrying }: { title: string; error: unknown; onRetry: () => void; retrying?: boolean }) {
  const msg = error instanceof Error ? error.message : "The request did not complete.";
  return (
    <div data-testid="panel-error" className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 break-words font-mono text-xs text-muted-foreground">{msg}</div>
      </div>
      <button data-testid="button-retry" onClick={onRetry} disabled={retrying} className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border bg-card px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
        <RotateCw className={cn("h-3 w-3", retrying && "animate-spin")} /> Retry
      </button>
    </div>
  );
}

export function Panel({ label, right, children, className }: { label: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("es-rise rounded-md border bg-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</h2>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
