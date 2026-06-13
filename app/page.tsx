// Placeholder during M2's Vercel build check. The full industrial dashboard
// (agent report: anomaly-first briefing + per-machine state) lands in M4.
import { MACHINE_STATES } from "@/lib/types.ts";

export default function Page() {
  return (
    <main className="wrap">
      <div className="topbar">
        <h1>Shop Floor Intelligence</h1>
        <span className="sub">scaffold — dashboard arrives in M4</span>
      </div>
      <p className="eyebrow">monitored states</p>
      <p>{MACHINE_STATES.join(" · ")}</p>
    </main>
  );
}
