import { useMemo, useState } from "react";

// Rent page (mock data dashboard)
// Period selector drives the calculations.
// Amounts are stored in cents to avoid floating-point issues.

const mockLeases = [
  { id: "l1", address: "1001 Dodge St #3B, Omaha, NE", dueDay: 1 },
  { id: "l2", address: "2507 Farnam St #12, Omaha, NE", dueDay: 1 },
  { id: "l3", address: "8612 Maple St #2A, Omaha, NE", dueDay: 5 },
];

const mockVacantUnits = [
  { id: "v1", address: "110 S 12th St #5A, Omaha, NE" },
  { id: "v2", address: "3020 Leavenworth St #1, Omaha, NE" },
  { id: "v3", address: "520 S 24th St #7, Omaha, NE" },
  { id: "v4", address: "7710 Cass St #9, Omaha, NE" },
  { id: "v5", address: "4010 Farnam St #4, Omaha, NE" },
  { id: "v6", address: "1402 Harney St #10, Omaha, NE" },
  { id: "v7", address: "8901 Maple St #3, Omaha, NE" },
];

// Ledger model (mock)
// Conventions:
// - CHARGE / LATE_FEE / ADJUSTMENT are typically positive (increase balance)
// - PAYMENT is negative (decrease balance)
const mockLedger = [
  // ===== 2025-12 =====
  { id: "e1", period: "2025-12", leaseId: "l1", type: "CHARGE", subType: "RENT", amountCents: 135000, postedAt: "2025-12-01T09:00:00Z" },
  { id: "e2", period: "2025-12", leaseId: "l1", type: "PAYMENT", subType: "RENT", amountCents: -80000, postedAt: "2025-12-10T18:00:00Z" },
  { id: "e3", period: "2025-12", leaseId: "l1", type: "ADJUSTMENT", subType: "RENT", amountCents: -2500, postedAt: "2025-12-16T15:20:00Z" },

  { id: "e4", period: "2025-12", leaseId: "l2", type: "CHARGE", subType: "RENT", amountCents: 120000, postedAt: "2025-12-01T09:00:00Z" },
  { id: "e5", period: "2025-12", leaseId: "l2", type: "PAYMENT", subType: "RENT", amountCents: -120000, postedAt: "2025-12-15T16:00:00Z" },

  { id: "e6", period: "2025-12", leaseId: "l3", type: "CHARGE", subType: "RENT", amountCents: 98000, postedAt: "2025-12-01T09:00:00Z" },
  { id: "e7", period: "2025-12", leaseId: "l3", type: "LATE_FEE", subType: "LATE_FEE", amountCents: 5000, postedAt: "2025-12-12T09:00:00Z" },

  // ===== 2026-01 (to prove period switch works) =====
  { id: "e8", period: "2026-01", leaseId: "l1", type: "CHARGE", subType: "RENT", amountCents: 135000, postedAt: "2026-01-01T09:00:00Z" },
  { id: "e9", period: "2026-01", leaseId: "l1", type: "PAYMENT", subType: "RENT", amountCents: -135000, postedAt: "2026-01-03T14:00:00Z" },
  { id: "e10", period: "2026-01", leaseId: "l2", type: "CHARGE", subType: "RENT", amountCents: 120000, postedAt: "2026-01-01T09:00:00Z" },
];

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getCurrentPeriodYYYYMM() {
  // Returns "YYYY-MM"
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function activityTitle(entry) {
  if (entry.type === "CHARGE" && entry.subType === "RENT") return "Rent charge posted";
  if (entry.type === "PAYMENT") return "Payment received";
  if (entry.type === "LATE_FEE") return "Late fee posted";
  if (entry.type === "ADJUSTMENT") return "Adjustment created";
  return "Ledger update";
}

export default function Rent() {
  const [period, setPeriod] = useState(getCurrentPeriodYYYYMM());

  const leaseById = useMemo(() => {
    const m = new Map();
    for (const l of mockLeases) m.set(l.id, l);
    return m;
  }, []);

  const periodLedger = useMemo(() => {
    return mockLedger
      .filter((e) => e.period === period)
      .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  }, [period]);

  // Build per-lease numbers for the selected period (Rent-only totals)
  const rows = useMemo(() => {
    const agg = new Map();

    // Initialize all leases with 0s so the table always shows all leases.
    for (const l of mockLeases) {
      agg.set(l.id, { leaseId: l.id, address: l.address, dueDay: l.dueDay, dueCents: 0, paidCents: 0, outstandingCents: 0 });
    }

    for (const e of periodLedger) {
      // Only count RENT subType for the "Rent Collection" block
      if (e.subType !== "RENT") continue;

      const item = agg.get(e.leaseId);
      if (!item) continue;

      if (e.type === "CHARGE") {
        item.dueCents += e.amountCents; // positive
      } else if (e.type === "PAYMENT") {
        item.paidCents += Math.abs(e.amountCents); // store paid as positive for display
      } else if (e.type === "ADJUSTMENT") {
        // Adjustments can be positive or negative; treat as affecting rent totals
        if (e.amountCents >= 0) item.dueCents += e.amountCents;
        else item.paidCents += Math.abs(e.amountCents);
      }
    }

    for (const item of agg.values()) {
      item.outstandingCents = Math.max(0, item.dueCents - item.paidCents);
    }

    return Array.from(agg.values());
  }, [periodLedger]);

  const totals = useMemo(() => {
    const totalDue = rows.reduce((s, r) => s + r.dueCents, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paidCents, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.outstandingCents, 0);
    return { totalDue, totalPaid, totalOutstanding };
  }, [rows]);

  // Activities for the selected period (uses all ledger types)
  const activities = useMemo(() => {
    return [...periodLedger]
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
      .map((e) => {
        const lease = leaseById.get(e.leaseId);
        const addr = lease ? lease.address : e.leaseId;
        const amt = money(Math.abs(e.amountCents));

        return {
          id: e.id,
          date: formatShortDate(e.postedAt),
          title: activityTitle(e),
          detail: `${amt} — ${addr}`,
        };
      });
  }, [periodLedger, leaseById]);

  return (
    <div className="container">
      <div className="rentGrid">
        {/* Region 1: Rent collection by selected period */}
        <section className="panel">
          <div className="panelHeader">
            <h2>{period} — Rent Collection</h2>

            <input
              className="periodInput"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Select period"
            />
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="kpiLabel">Total Due</div>
              <div className="kpiValue">{money(totals.totalDue)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Total Paid</div>
              <div className="kpiValue">{money(totals.totalPaid)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Outstanding</div>
              <div className="kpiValue">{money(totals.totalOutstanding)}</div>
            </div>
          </div>

          <div className="table">
            <div className="row head">
              <div>Address</div>
              <div className="right">Due</div>
              <div className="right">Paid</div>
              <div className="right">Outstanding</div>
            </div>

            {rows.map((r) => (
              <div className="row" key={r.leaseId}>
                <div>
                  <div className="addr">{r.address}</div>
                  <div className="meta">Due day: {r.dueDay}</div>
                </div>
                <div className="right">{money(r.dueCents)}</div>
                <div className="right">{money(r.paidCents)}</div>
                <div className="right">{money(r.outstandingCents)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Region 2: Vacant units (scrollable) */}
        <section className="panel">
          <div className="panelHeader">
            <h2>Vacant Units</h2>
            <span className="chip">{mockVacantUnits.length} vacant</span>
          </div>

          <div className="scrollArea">
            {mockVacantUnits.map((u) => (
              <div className="listItem" key={u.id}>
                <div className="dot" />
                <div>
                  <div className="addr">{u.address}</div>
                  <div className="meta">Status: Vacant</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Region 3: Rent activities (scrollable, filtered by period) */}
        <section className="panel">
          <div className="panelHeader">
            <h2>Rent Activities</h2>
            <span className="chip">Period: {period}</span>
          </div>

          <div className="scrollArea">
            {activities.length === 0 ? (
              <div className="meta" style={{ padding: 10 }}>
                No activity for this period.
              </div>
            ) : (
              activities.map((a) => (
                <div className="listItem" key={a.id}>
                  <div className="dot" />
                  <div style={{ flex: 1 }}>
                    <div className="addr" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span>{a.title}</span>
                      <span className="meta" style={{ marginTop: 0 }}>
                        {a.date}
                      </span>
                    </div>
                    <div className="meta">{a.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
