import { useEffect, useMemo, useState } from "react";

// Rent page (API-driven). Minimal + robust for MongoDB.
// - Supports both `id` and `_id`
// - Money stored as cents

function money(cents) {
    return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function getCurrentPeriodYYYYMM() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

function propId(p) {
    // Support both `id` and MongoDB `_id`.
    return String(p?.id ?? p?._id ?? "");
}

function formatShortDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function activityTitle(e) {
    if (e.type === "CHARGE" && e.subType === "RENT") return "Rent charge posted";
    if (e.type === "PAYMENT" && e.subType === "RENT") return "Payment received";
    if (e.type === "LATE_FEE") return "Late fee posted";
    if (e.type === "ADJUSTMENT") return "Adjustment created";
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
    const [generatingLateFees, setGeneratingLateFees] = useState(false);
    const [showLateFeeConfirm, setShowLateFeeConfirm] = useState(false);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentPropertyId, setPaymentPropertyId] = useState("");
    const [paymentAmount, setPaymentAmount] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [actionMsg, setActionMsg] = useState("");

    async function loadProperties(signal) {
        const res = await fetch("/api/properties", { signal });
        if (!res.ok) throw new Error(`Properties HTTP ${res.status}`);
        const data = await res.json();
        setProperties(Array.isArray(data) ? data : []);
    }

    async function loadEntries(p, signal) {
        const res = await fetch(`/api/rent/activities?period=${encodeURIComponent(p)}`, { signal });
        if (!res.ok) throw new Error(`Activities HTTP ${res.status}`);
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
    }

    // Delete a rent activity entry
    async function deleteEntry(entryId) {
        const ok = window.confirm("Delete this activity? This cannot be undone.");
        if (!ok) return;

        try {
            setErr("");
            setActionMsg("Deleting activity...");

            const res = await fetch(`/api/rent/activities/${entryId}`, { method: "DELETE" });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.message || `Delete HTTP ${res.status}`);

            setActionMsg("Deleted.");
            await loadEntries(period);
        } catch (e) {
            const msg = e?.message || "Failed to delete activity";
            setErr(msg);
            setActionMsg(msg);
        }
    }

    // Load properties once
    useEffect(() => {
        const ac = new AbortController();
        (async () => {
            try {
                setLoadingProps(true);
                setErr("");
                await loadProperties(ac.signal);
            } catch (e) {
                if (!ac.signal.aborted) setErr(e?.message || "Failed to load properties");
            } finally {
                if (!ac.signal.aborted) setLoadingProps(false);
            }
        })();
        return () => ac.abort();
    }, []);

    // Load entries whenever period changes
    useEffect(() => {
        const ac = new AbortController();
        (async () => {
            try {
                setLoadingEntries(true);
                setErr("");
                await loadEntries(period, ac.signal);
            } catch (e) {
                if (!ac.signal.aborted) setErr(e?.message || "Failed to load rent activities");
            } finally {
                if (!ac.signal.aborted) setLoadingEntries(false);
            }
        })();
        return () => ac.abort();
    }, [period]);


    // Auto-dismiss toast after 3 seconds.
    useEffect(() => {
        if (!actionMsg) return;
        const t = setTimeout(() => setActionMsg(""), 3000);
        return () => clearTimeout(t);
    }, [actionMsg]);

    // Generate rent charges for the period
    async function generateCharges() {
        try {
            setGenerating(true);
            setErr("");
            setActionMsg("Generating charges...");

            const res = await fetch("/api/rent/generate-charges", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.message || `Generate HTTP ${res.status}`);

            const created = payload.createdCount ?? 0;
            setActionMsg(created > 0 ? `Generated ${created} charge(s).` : "No new charges (already generated for this period).");

            await loadEntries(period);
        } catch (e) {
            const msg = e?.message || "Failed to generate charges";
            setErr(msg);
            setActionMsg(msg);
        } finally {
            setGenerating(false);
        }
    }

    // Generate late fees for the period
    async function generateLateFees() {
        try {
            setGeneratingLateFees(true);
            setErr("");
            setActionMsg("Generating late fees...");

            const res = await fetch("/api/rent/generate-late-fees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.message || `Late fee HTTP ${res.status}`);

            const created = payload.createdCount ?? 0;
            setActionMsg(created > 0 ? `Generated ${created} late fee(s).` : "No late fees generated.");

            await loadEntries(period);
        } catch (e) {
            const msg = e?.message || "Failed to generate late fees";
            setErr(msg);
            setActionMsg(msg);
        } finally {
            setGeneratingLateFees(false);
        }
    }



    async function submitPayment() {
        if (!paymentPropertyId) return alert("Please select a property.");
        if (!paymentAmount || Number(paymentAmount) <= 0) return alert("Please enter a positive amount.");

        try {
            setSubmitting(true);
            setErr("");

            const res = await fetch("/api/rent/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ propertyId: paymentPropertyId, amountDollars: paymentAmount }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.message || `Payment HTTP ${res.status}`);

            setShowPaymentModal(false);
            setPaymentAmount("");
            await loadEntries(period);
        } catch (e) {
            setErr(e?.message || "Failed to record payment");
        } finally {
            setSubmitting(false);
        }
    }

    const occupied = useMemo(() => properties.filter((p) => !!p.currentLease), [properties]);
    const vacant = useMemo(() => properties.filter((p) => !p.currentLease), [properties]);

    const propertyById = useMemo(() => {
        const m = new Map();
        for (const p of properties) {
            const pid = propId(p);
            m.set(pid, p);

            const lid = String(p.currentLease?.id ?? p.currentLease?._id ?? "");
            if (lid) m.set(lid, p); // allow lookup by leaseId too
        }
        return m;
    }, [properties]);

    // Region 1 rows + totals (rent-only)
    const rows = useMemo(() => {
        const agg = new Map();

        // IMPORTANT: use normalized id, otherwise multiple properties overwrite each other
        for (const p of occupied) {
            const pid = propId(p);
            agg.set(pid, {
                propertyId: pid,
                address: p.address,
                dueDay: p.currentLease?.dueDay ?? "-",
                dueCents: 0,
                paidCents: 0,
                outstandingCents: 0,
            });
        }

        for (const e of entries) {
            if (e.subType !== "RENT") continue;

            const raw = String(e.propertyId ?? e.leaseId ?? "");
            const p = propertyById.get(raw);
            const pid = p ? propId(p) : raw;
            const row = agg.get(pid);

            if (!row) continue;

            if (e.type === "CHARGE") row.dueCents += e.amountCents;
            if (e.type === "PAYMENT") row.paidCents += Math.abs(e.amountCents);
            if (e.type === "ADJUSTMENT") {
                if (e.amountCents >= 0) row.dueCents += e.amountCents;
                else row.paidCents += Math.abs(e.amountCents);
            }
        }

        for (const r of agg.values()) {
            r.outstandingCents = Math.max(0, r.dueCents - r.paidCents);
        }

        return Array.from(agg.values());
    }, [entries, occupied]);

    const totals = useMemo(() => {
        const totalDue = rows.reduce((s, r) => s + r.dueCents, 0);
        const totalPaid = rows.reduce((s, r) => s + r.paidCents, 0);
        const totalOutstanding = rows.reduce((s, r) => s + r.outstandingCents, 0);
        return { totalDue, totalPaid, totalOutstanding };
    }, [rows]);

    // Region 3 activities (all entry types)
    const activities = useMemo(() => {
        const sorted = [...entries].sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));

        return sorted.map((e) => {
            const raw = String(e.propertyId ?? e.leaseId ?? "");
            const p = propertyById.get(raw);
            const addr = p?.address || raw;

            return {
                id: String(e.id ?? e._id ?? ""),
                date: formatShortDate(e.postedAt),
                title: activityTitle(e),
                detail: `${money(Math.abs(e.amountCents))} — ${addr}`,
            };
        });
    }, [entries, propertyById]);

    const loading = loadingProps || loadingEntries;

    return (
        <div className="container">
            {actionMsg && (
                <div
                    className="toast"
                    role="status"
                    aria-live="polite"
                    onClick={() => setActionMsg("")}
                    title="Click to dismiss"
                >
                    {actionMsg}
                </div>
            )}
            {err && <p className="meta">Error: {err}</p>}

            <div className="rentGrid">
                {/* Region 1 */}
                <section className="panel">
                    <div className="panelHeader" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <h2 style={{ marginRight: "auto" }}>{period} — Rent Collection</h2>

                        <input
                            className="periodInput"
                            type="month"
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                        />

                        <div style={{ display: "flex", gap: 10 }}>
                            <button className="actionBtn" type="button" onClick={generateCharges} disabled={generating}>
                                {generating ? "Generating..." : "Generate Charges"}
                            </button>

                            <button
                                className="actionBtn ghost"
                                type="button"
                                onClick={() => setShowLateFeeConfirm(true)}
                                disabled={generatingLateFees}
                                title="Creates a late fee entry for properties with outstanding rent in this period."
                            >
                                {generatingLateFees ? "Generating..." : "Post Late Fees"}
                            </button>
                        </div>
                    </div>

                    {showLateFeeConfirm && (
                        <div className="modalOverlay" onClick={() => setShowLateFeeConfirm(false)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <div className="modalTitle">Confirm</div>
                                <div className="meta" style={{ marginTop: 6 }}>
                                    This will post late fees for period <b>{period}</b>. Continue?
                                </div>

                                <div className="modalActions">
                                    <button
                                        className="actionBtn ghost"
                                        type="button"
                                        onClick={() => setShowLateFeeConfirm(false)}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        className="actionBtn"
                                        type="button"
                                        disabled={generatingLateFees}
                                        onClick={async () => {
                                            setShowLateFeeConfirm(false);
                                            await generateLateFees();
                                        }}
                                    >
                                        {generatingLateFees ? "Posting..." : "Confirm"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

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
                                        {occupied.map((p) => (
                                            <option key={propId(p)} value={propId(p)}>
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

                {/* Region 2 */}
                <section className="panel">
                    <div className="panelHeader">
                        <h2>Vacant Units</h2>
                        <span className="chip">{vacant.length} vacant</span>
                    </div>

                    <div className="scrollArea">
                        {loadingProps ? (
                            <div className="meta" style={{ padding: 10 }}>
                                Loading...
                            </div>
                        ) : vacant.length === 0 ? (
                            <div className="meta" style={{ padding: 10 }}>
                                No vacant units.
                            </div>
                        ) : (
                            vacant.map((u) => (
                                <div className="listItem" key={propId(u)}>
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

                {/* Region 3 */}
                <section className="panel">
                    <div className="panelHeader" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <h2 style={{ marginRight: "auto" }}>Rent Activities</h2>
                        <span className="chip">Period: {period}</span>
                        <button className="actionBtn" type="button" onClick={() => setShowPaymentModal(true)}>
                            Record Payment
                        </button>
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
                                        <div className="addr" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                            <span>{a.title}</span>

                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <span className="meta" style={{ marginTop: 0 }}>
                                                    {a.date}
                                                </span>

                                                <button
                                                    className="actionBtn ghost"
                                                    type="button"
                                                    onClick={() => deleteEntry(a.id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
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