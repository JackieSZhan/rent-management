import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Property list page (API-driven).
export default function PropertyList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch("/api/properties");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load properties");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <h1>Property List</h1>

      {loading && <p className="meta">Loading...</p>}
      {err && <p className="meta">Error: {err}</p>}

      {!loading && !err && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {items.map((p) => (
            <Link key={p.id} to={`/properties/${p.id}`} className="cardLink">
              <div className="panel" style={{ padding: 14 }}>
                <div className="meta">Property Address</div>
                <div className="addr" style={{ marginTop: 6 }}>
                  {p.address}
                </div>
                <div className="meta" style={{ marginTop: 8 }}>
                  Status: {p.currentLease ? "Occupied" : "Vacant"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}