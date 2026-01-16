import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function PropertyDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch(`/api/properties/${id}`, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItem(data);
      } catch (e) {
        if (!ac.signal.aborted) setErr(e?.message || "Failed to load property");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [id]);

  const lease = item?.currentLease || null;
  const tenant = lease?.tenant || null;

  const lateRule = useMemo(() => {
    if (!lease) return "-";
    const pct = Number(lease.lateFeePercent || 0);
    const amt = Number(lease.lateFeeAmountCents || 0);
    if (pct > 0) return `${pct > 1 ? pct : pct * 100}%`;
    if (amt > 0) return money(amt);
    return "-";
  }, [lease]);

  if (loading) return <div className="container"><div className="meta">Loading...</div></div>;
  if (err) return <div className="container"><div className="meta">Error: {err}</div></div>;
  if (!item) return <div className="container"><div className="meta">Not found</div></div>;

  return (
    <div className="container">
      <div style={{ marginBottom: 12 }}>
        <Link className="navLink" to="/properties">← Back</Link>
      </div>

      <section className="panel">
        <div className="panelHeader">
          <h2>Property</h2>
          <span className="chip">{lease ? "Occupied" : "Vacant"}</span>
        </div>

        <div className="addr" style={{ fontSize: 16 }}>{item.address}</div>

        {!lease ? (
          <div className="meta" style={{ marginTop: 10 }}>No current lease.</div>
        ) : (
          <div className="detailGrid" style={{ marginTop: 12 }}>
            <div className="kvGrid">
              <div className="kv">
                <div className="kvLabel">Tenant</div>
                <div className="kvValue">{tenant?.fullName || "-"}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Rent</div>
                <div className="kvValue">{money(lease.rentCents)}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Deposit</div>
                <div className="kvValue">{money(lease.depositCents)}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Due day</div>
                <div className="kvValue">{lease.dueDay ?? "-"}</div>
              </div>
            </div>

            <div className="kvGrid">
              <div className="kv">
                <div className="kvLabel">Start</div>
                <div className="kvValue">{lease.startDate || "-"}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">End</div>
                <div className="kvValue">{lease.endDate || "-"}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Phone</div>
                <div className="kvValue">{tenant?.phone || "-"}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Email</div>
                <div className="kvValue">{tenant?.email || "-"}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Late fee rule</div>
                <div className="kvValue">{lateRule}</div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}