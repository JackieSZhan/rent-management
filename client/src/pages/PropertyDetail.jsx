import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { mockProperties } from "../mock/properties";

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

// Property detail page (mock).
export default function PropertyDetail() {
  const { id } = useParams();

  const property = useMemo(() => mockProperties.find((p) => p.id === id), [id]);

  if (!property) {
    return (
      <div className="container">
        <h1>Property</h1>
        <p className="meta">Not found.</p>
        <div style={{ marginTop: 12 }}>
          <Link className="meta" to="/properties">← Back to Property List</Link>
        </div>
      </div>
    );
  }

  const lease = property.currentLease;

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1>Property</h1>
        <Link className="meta" to="/properties">← Back</Link>
      </div>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panelHeader">
          <h2>Address</h2>
          <span className="chip">{lease ? "Occupied" : "Vacant"}</span>
        </div>
        <div className="addr">{property.address}</div>
      </section>

      <div className="detailGrid" style={{ marginTop: 12 }}>
        {/* Current lease term */}
        <section className="panel">
          <div className="panelHeader">
            <h2>Current Lease Term</h2>
            <span className="chip">{lease ? "Active" : "None"}</span>
          </div>

          {lease ? (
            <div className="kvGrid">
              <div className="kv">
                <div className="kvLabel">Start Date</div>
                <div className="kvValue">{formatDate(lease.startDate)}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">End Date</div>
                <div className="kvValue">{formatDate(lease.endDate)}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Due Day</div>
                <div className="kvValue">{lease.dueDay}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Monthly Rent</div>
                <div className="kvValue">{money(lease.rentCents)}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Deposit</div>
                <div className="kvValue">{money(lease.depositCents)}</div>
              </div>
            </div>
          ) : (
            <div className="meta">No active lease for this property.</div>
          )}
        </section>

        {/* Current tenant */}
        <section className="panel">
          <div className="panelHeader">
            <h2>Current Tenant</h2>
            <span className="chip">Contact</span>
          </div>

          {lease?.tenant ? (
            <div className="kvGrid">
              <div className="kv">
                <div className="kvLabel">Name</div>
                <div className="kvValue">{lease.tenant.fullName}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Phone</div>
                <div className="kvValue">{lease.tenant.phone}</div>
              </div>
              <div className="kv">
                <div className="kvLabel">Email</div>
                <div className="kvValue">{lease.tenant.email}</div>
              </div>
            </div>
          ) : (
            <div className="meta">No tenant (vacant).</div>
          )}
        </section>
      </div>
    </div>
  );
}
