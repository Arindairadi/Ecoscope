import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Observation } from "@workspace/api-client-react";

export function SeriesChart({ observations, unit }: { observations: Observation[]; unit: string }) {
  const data = observations.map((o) => ({ t: o.timestamp.slice(0, 10), v: o.value, kind: o.kind, source: o.source }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" />
        <XAxis dataKey="t" tick={{ fontSize: 10, fontFamily: "var(--app-font-mono)", fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fontFamily: "var(--app-font-mono)", fill: "hsl(var(--muted-foreground))" }} label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
        <Line type="monotone" dataKey="v" stroke="hsl(var(--chart-1))" strokeWidth={1.75} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
