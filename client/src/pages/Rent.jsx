import { useEffect, useMemo, useState } from "react";

// Rent page (API-driven).
// - Loads properties once
// - Loads rent activities (ledger entries) whenever the selected period changes
// Amounts are stored in cents to avoid floating-point issues.

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
    if (entry.type === "PAYMENT" && entry.subType === "RENT") return "Payment received";
    if (entry.type === "LATE_FEE") return "Late fee posted";
    if (entry.type === "ADJUSTMENT") return "Adjustment created";
    return "Ledger update";
}

export default function Rent() {
    const [period, setPeriod] = useState(getCurrentPeriodYYYYMM());

    const [properties, setProperties] = useState([]);
    const [entries, setEntries] = useState([]);

    const [loadingProps, setLoadingProps] = useState(true);
    const [loadingEntries, setLoadingEntries] = useState(true);
    const [err, setErr] = useState("");

    const [generating, setGenerating] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentPropertyId, setPaymentPropertyId] = useState("");
    const [paymentAmount, setPaymentAmount] = useState("");
    const [submitting, setSubmitting] = useState(false);



    // Post a new payment to backend, then refresh current period data.
    async function submitPayment() {
        if (!paymentPropertyId) {
            alert("Please select a property.");
            return;
        }
        if (!paymentAmount || Number(paymentAmount) <= 0) {
            alert("Please enter a positive amount.");
            return;
        }

        try {
            setSubmitting(true);
            setErr("");

            const res = await fetch("/api/rent/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    propertyId: paymentPropertyId,
                    amountDollars: paymentAmount, // server converts to cents
                    // postedAt: optional (defaults to now)
                }),
            });

            if (!res.ok) throw new Error(`Payment HTTP ${res.status}`);

            // Close modal and refresh entries
            setShowPaymentModal(false);
            setPaymentAmount("");
            setReloadToken((x) => x + 1);
        } catch (e) {
            setErr(e?.message || "Failed to record payment");
        } finally {
            setSubmitting(false);
        }
    }
    // Generate monthly rent charges for the selected period.
    async function generateCharges() {
        // Generate monthly rent charges for the selected period.
        try {
            setGenerating(true);
            setErr("");

            const res = await fetch("/api/rent/generate-charges", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period }),
            });

            const payload = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(payload?.message || `Generate HTTP ${res.status}`);
            }

            // Helpful debug + user feedback
            console.log("generate-charges response:", payload);
            alert(`Generate Charges done. createdCount=${payload.createdCount ?? "?"}`);

            // Refresh the current period activities/totals
            setReloadToken((x) => x + 1);
        } catch (e) {
            setErr(e?.message || "Failed to generate charges");
        } finally {
            setGenerating(false);
        }
    }


    // Load properties once
    useEffect(() => {
        let cancelled = false;

        async function loadProperties() {
            try {
                setLoadingProps(true);
                setErr("");

                const res = await fetch("/api/properties");
                if (!res.ok) throw new Error(`Properties HTTP ${res.status}`);

                const data = await res.json();
                if (!cancelled) setProperties(data);
            } catch (e) {
                if (!cancelled) setErr(e?.message || "Failed to load properties");
            } finally {
                if (!cancelled) setLoadingProps(false);
            }
        }
        loadProperties();
        return () => {
            cancelled = true;
        };
    }, []);

    // Load rent activities (ledger entries) when period changes
    useEffect(() => {
        let cancelled = false;

        async function loadEntries() {
            try {
                setLoadingEntries(true);
                setErr("");

                const res = await fetch(`/api/rent/activities?period=${encodeURIComponent(period)}`);
                if (!res.ok) throw new Error(`Activities HTTP ${res.status}`);

                const data = await res.json();
                if (!cancelled) setEntries(data);
            } catch (e) {
                if (!cancelled) setErr(e?.message || "Failed to load rent activities");
            } finally {
                if (!cancelled) setLoadingEntries(false);
            }
        }

        loadEntries();
        return () => {
            cancelled = true;
        };
    }, [period, reloadToken]);

    const propertyById = useMemo(() => {
        const m = new Map();
        for (const p of properties) m.set(p.id, p);
        return m;
    }, [properties]);

    const vacantUnits = useMemo(() => {
        return properties.filter((p) => !p.currentLease);
    }, [properties]);

    const occupiedProperties = useMemo(() => {
        return properties.filter((p) => !!p.currentLease);
    }, [properties]);

    // Build "Rent Collection" rows for the selected period based on ledger entries (rent-only).
    const rows = useMemo(() => {
        const agg = new Map();

        // Initialize occupied properties so the table always shows them even if no entries exist.
        for (const p of occupiedProperties) {
            agg.set(p.id, {
                propertyId: p.id,
                address: p.address,
                dueDay: p.currentLease?.dueDay ?? "-",
                dueCents: 0,
                paidCents: 0,
                outstandingCents: 0,
            });
        }

        for (const e of entries) {
            // Only count rent items in Region 1 totals/table
            if (e.subType !== "RENT") continue;

            const pid = e.propertyId ?? e.leaseId; // Support both field names
            const row = agg.get(pid);

            if (!row) continue;

            if (e.type === "CHARGE") {
                row.dueCents += e.amountCents;
            } else if (e.type === "PAYMENT") {
                row.paidCents += Math.abs(e.amountCents);
            } else if (e.type === "ADJUSTMENT") {
                // Adjustments may be positive or negative; treat them as rent-related
                if (e.amountCents >= 0) row.dueCents += e.amountCents;
                else row.paidCents += Math.abs(e.amountCents);
            }
        }

        for (const row of agg.values()) {
            row.outstandingCents = Math.max(0, row.dueCents - row.paidCents);
        }

        return Array.from(agg.values());
    }, [entries, occupiedProperties]);

    const totals = useMemo(() => {
        const totalDue = rows.reduce((s, r) => s + r.dueCents, 0);
        const totalPaid = rows.reduce((s, r) => s + r.paidCents, 0);
        const totalOutstanding = rows.reduce((s, r) => s + r.outstandingCents, 0);
        return { totalDue, totalPaid, totalOutstanding };
    }, [rows]);

    // Activities list (all entry types) for Region 3
    const activities = useMemo(() => {
        const sorted = [...entries].sort((a, b) => b.postedAt.localeCompare(a.postedAt));

        return sorted.map((e) => {
            const pid = e.propertyId ?? e.leaseId; // Support both field names
            const p = propertyById.get(pid);
            const addr = p?.address || pid;
            return {
                id: e.id,
                date: formatShortDate(e.postedAt),
                title: activityTitle(e),
                detail: `${money(Math.abs(e.amountCents))} — ${addr}`,
            };
        });
    }, [entries, propertyById]);

    const loading = loadingProps || loadingEntries;

    return (
        <div className="container">
            {err && <p className="meta">Error: {err}</p>}

            <div className="rentGrid">
                {/* Region 1: Rent collection by selected period */}
                <section className="panel">
                    <div className="panelHeader">
                        <button className="actionBtn" type="button" onClick={generateCharges} disabled={generating}>
                            {generating ? "Generating..." : "Generate Charges"}
                        </button>
                        <h2>{period} — Rent Collection</h2>

                        <input
                            className="periodInput"
                            type="month"
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            aria-label="Select period"
                        />
                    </div>

                    {showPaymentModal && (
                        <div className="modalOverlay" onClick={() => setShowPaymentModal(false)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <div className="modalTitle">Record Payment</div>

                                <div className="modalField">
                                    <div className="meta">Property</div>
                                    <select
                                        className="modalInput"
                                        value={paymentPropertyId}
                                        onChange={(e) => setPaymentPropertyId(e.target.value)}
                                    >
                                        <option value="">Select...</option>
                                        {properties
                                            .filter((p) => p.currentLease) // only occupied
                                            .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.address}
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                <div className="modalField">
                                    <div className="meta">Amount (USD)</div>
                                    <input
                                        className="modalInput"
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="e.g. 800"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                    />
                                </div>

                                <div className="modalActions">
                                    <button className="actionBtn ghost" type="button" onClick={() => setShowPaymentModal(false)}>
                                        Cancel
                                    </button>
                                    <button className="actionBtn" type="button" onClick={submitPayment} disabled={submitting}>
                                        {submitting ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="meta">Loading...</div>
                    ) : (
                        <>
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
                                    <div className="row" key={r.propertyId}>
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
                        </>
                    )}
                </section>

                {/* Region 2: Vacant units (scrollable) */}
                <section className="panel">
                    <div className="panelHeader">
                        <h2>Vacant Units</h2>
                        <span className="chip">{vacantUnits.length} vacant</span>
                    </div>

                    <div className="scrollArea">
                        {loadingProps ? (
                            <div className="meta" style={{ padding: 10 }}>
                                Loading...
                            </div>
                        ) : vacantUnits.length === 0 ? (
                            <div className="meta" style={{ padding: 10 }}>
                                No vacant units.
                            </div>
                        ) : (
                            vacantUnits.map((u) => (
                                <div className="listItem" key={u.id}>
                                    <div className="dot" />
                                    <div>
                                        <div className="addr">{u.address}</div>
                                        <div className="meta">Status: Vacant</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Region 3: Rent activities (scrollable, filtered by period) */}
                <section className="panel">
                    <div className="panelHeader">
                        <h2>Rent Activities</h2>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span className="chip">Period: {period}</span>
                            <button className="actionBtn" type="button" onClick={() => setShowPaymentModal(true)}>
                                Record Payment
                            </button>
                        </div>
                    </div>

                    <div className="scrollArea">
                        {loadingEntries ? (
                            <div className="meta" style={{ padding: 10 }}>
                                Loading...
                            </div>
                        ) : activities.length === 0 ? (
                            <div className="meta" style={{ padding: 10 }}>
                                No activity for this period.
                            </div>
                        ) : (
                            activities.map((a) => (
                                <div className="listItem" key={a.id}>
                                    <div className="dot" />
                                    <div style={{ flex: 1 }}>
                                        <div
                                            className="addr"
                                            style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
                                        >
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
