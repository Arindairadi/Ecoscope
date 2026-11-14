import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyValue } from "@workspace/api-client-react";

type TipProps = { active?: boolean; payload?: { payload: { month: string; value: number | null } }[]; unit: string };
function Tip({ active, payload, unit }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-sm border bg-popover px-2 py-1 font-mono text-xs shadow-sm">
      <div className="text-muted-foreground">{p.month}</div>
      <div>{p.value === null ? "missing (null)" : `${p.value.toFixed(2)} ${unit}`}</div>
    </div>
  );
}

export function PowerChart({ values, unit }: { values: MonthlyValue[]; unit: string }) {
  const data = values.map((v) => ({ month: v.month, value: v.value }));
  const tick = { fontSize: 10, fontFamily: "var(--app-font-mono)", fill: "hsl(var(--muted-foreground))" };
  return (
    <div data-testid="chart-power" role="img" aria-label={`Monthly series of ${values.length} months in ${unit}`}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" />
          <XAxis dataKey="month" tick={tick} minTickGap={24} />
          <YAxis tick={tick} domain={["auto", "auto"]} label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 10 }} />
          <Tooltip content={<Tip unit={unit} />} />
          <Line type="linear" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={1.75} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
          {data.length > 6 && <Brush dataKey="month" height={22} travellerWidth={8} stroke="hsl(var(--primary))" fill="hsl(var(--card))" />}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">Drag the brush handles to zoom. Straight segments join adjacent months only; gaps mark missing months and are not interpolated.</p>
    </div>
  );
}
