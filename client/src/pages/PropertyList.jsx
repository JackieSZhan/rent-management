import { useEffect, useMemo, useState } from "react";

function propId(p) {
  return String(p?.id ?? p?._id ?? "");
}

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function PropertyList() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);

  // Form fields
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [stateUS, setStateUS] = useState("");
  const [zip, setZip] = useState("");

  const [showLeaseModal, setShowLeaseModal] = useState(false);
  const [leasePropId, setLeasePropId] = useState("");

  const [leaseTenantName, setLeaseTenantName] = useState("");
  const [leaseRentDollars, setLeaseRentDollars] = useState("");
  const [leaseDueDay, setLeaseDueDay] = useState("1");

  const occupied = useMemo(() => properties.filter((p) => !!p.currentLease), [properties]);
  const vacant = useMemo(() => properties.filter((p) => !p.currentLease), [properties]);

  async function loadProps() {
    const res = await fetch("/api/properties");
    if (!res.ok) throw new Error(`Properties HTTP ${res.status}`);
    const data = await res.json();
    setProperties(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setErr("");
        await loadProps();
      } catch (e) {
        setErr(e?.message || "Failed to load properties");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // Auto-dismiss toast (reuse your pattern)
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(""), 3000);
    return () => clearTimeout(t);
  }, [actionMsg]);

  function resetForm() {
    setAddr1("");
    setAddr2("");
    setCity("");
    setStateUS("");
    setZip("");
  }

  async function createProperty() {
    // Minimal client validation
    if (!addr1.trim()) return alert("Address line 1 is required.");
    if (!city.trim()) return alert("City is required.");
    if (!stateUS.trim()) return alert("State is required.");
    if (!zip.trim()) return alert("ZipCode is required.");

    try {
      setErr("");
      setActionMsg("Creating property...");

      const body = {
        addressLine1: addr1.trim(),
        addressLine2: addr2.trim() || "",
        city: city.trim(),
        state: stateUS.trim(),
        zipCode: zip.trim()
          ? {
            tenantName: tenantName.trim(),
            rentCents: Math.round(Number(rentDollars || 0) * 100),
            dueDay: Number(dueDay || 1),
          }
          : null,
      };

      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || `Create HTTP ${res.status}`);

      setShowAddModal(false);
      resetForm();
      setActionMsg("Created.");
      await loadProps();
    } catch (e) {
      const msg = e?.message || "Failed to create property";
      setErr(msg);
      setActionMsg(msg);
    }
  }

  async function deleteProperty(id) {
    const ok = window.confirm("Delete this property? This cannot be undone.");
    if (!ok) return;

    try {
      setErr("");
      setActionMsg("Deleting...");

      const res = await fetch(`/api/properties/${id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || `Delete HTTP ${res.status}`);

      setActionMsg("Deleted.");
      await loadProps();
    } catch (e) {
      const msg = e?.message || "Failed to delete property";
      setErr(msg);
      setActionMsg(msg);
    }
  }

  return (
    <div className="container">
      {actionMsg && (
        <div className="toast" role="status" aria-live="polite" onClick={() => setActionMsg("")} title="Click to dismiss">
          {actionMsg}
        </div>
      )}
      {err && <p className="meta">Error: {err}</p>}

      <section className="panel">
        <div className="panelHeader" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ marginRight: "auto" }}>Properties</h2>
          <button className="actionBtn" type="button" onClick={() => setShowAddModal(true)}>
            Add
          </button>
        </div>

        {loading ? (
          <div className="meta">Loading...</div>
        ) : (
          <div className="detailGrid">
            {/* Occupied */}
            <div className="panel" style={{ padding: 12 }}>
              <div className="panelHeader">
                <h2>Occupied</h2>
                <span className="chip">{occupied.length}</span>
              </div>

              <div className="scrollArea" style={{ maxHeight: 520 }}>
                {occupied.length === 0 ? (
                  <div className="meta" style={{ padding: 10 }}>
                    No occupied properties.
                  </div>
                ) : (
                  occupied.map((p) => (
                    <div className="listItem" key={propId(p)} style={{ justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div className="dot" />
                        <div>
                          <button
                            type="button"
                            className="addrLink"
                            onClick={() => {
                              setLeasePropId(propId(p));
                              setLeaseTenantName(p.currentLease?.tenantName || "");
                              setLeaseRentDollars(
                                p.currentLease?.rentCents ? String(p.currentLease.rentCents / 100) : ""
                              );
                              setLeaseDueDay(String(p.currentLease?.dueDay ?? 1));
                              setShowLeaseModal(true);
                            }}
                          >
                            {p.address}
                          </button>
                          <div className="meta">
                            {p.currentLease?.tenantName || "Tenant"} · {money(p.currentLease?.rentCents)} · Due day {p.currentLease?.dueDay ?? "-"}
                          </div>
                        </div>
                      </div>

                      <button className="actionBtn ghost" type="button" onClick={() => deleteProperty(propId(p))}>
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Vacant */}
            <div className="panel" style={{ padding: 12 }}>
              <div className="panelHeader">
                <h2>Vacant</h2>
                <span className="chip">{vacant.length}</span>
              </div>

              <div className="scrollArea" style={{ maxHeight: 520 }}>
                {vacant.length === 0 ? (
                  <div className="meta" style={{ padding: 10 }}>
                    No vacant properties.
                  </div>
                ) : (
                  vacant.map((p) => (
                    <div className="listItem" key={propId(p)} style={{ justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div className="dot" />
                        <div>
                          <div className="addr">{p.address}</div>
                          <div className="meta">Status: Vacant</div>
                        </div>
                      </div>

                      <button className="actionBtn ghost" type="button" onClick={() => deleteProperty(propId(p))}>
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modalOverlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Add Property</div>

            <div className="modalField">
              <div className="meta">Address line 1 *</div>
              <input className="modalInput" value={addr1} onChange={(e) => setAddr1(e.target.value)} placeholder="e.g. 1234 S 12nd Street" />
            </div>

            <div className="modalField">
              <div className="meta">Address line 2 (optional)</div>
              <input className="modalInput" value={addr2} onChange={(e) => setAddr2(e.target.value)} placeholder="Apt / Unit" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr 0.8fr", gap: 10, marginTop: 10 }}>
              <div className="modalField" style={{ marginTop: 0 }}>
                <div className="meta">City *</div>
                <input className="modalInput" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>

              <div className="modalField" style={{ marginTop: 0 }}>
                <div className="meta">State *</div>
                <input className="modalInput" value={stateUS} onChange={(e) => setStateUS(e.target.value)} placeholder="AL" />
              </div>

              <div className="modalField" style={{ marginTop: 0 }}>
                <div className="meta">ZipCode *</div>
                <input className="modalInput" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="12345" />
              </div>
            </div>

            <div className="modalActions">
              <button
                className="actionBtn ghost"
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button className="actionBtn" type="button" onClick={createProperty}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Lease Modal */}
      {showLeaseModal && (
        <div className="modalOverlay" onClick={() => setShowLeaseModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Lease details</div>

            <div className="modalField">
              <div className="meta">Tenant name</div>
              <input
                className="modalInput"
                value={leaseTenantName}
                onChange={(e) => setLeaseTenantName(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div className="modalField" style={{ marginTop: 0 }}>
                <div className="meta">Rent (USD)</div>
                <input
                  className="modalInput"
                  type="number"
                  inputMode="decimal"
                  value={leaseRentDollars}
                  onChange={(e) => setLeaseRentDollars(e.target.value)}
                />
              </div>

              <div className="modalField" style={{ marginTop: 0 }}>
                <div className="meta">Due day</div>
                <input
                  className="modalInput"
                  type="number"
                  min="1"
                  max="31"
                  value={leaseDueDay}
                  onChange={(e) => setLeaseDueDay(e.target.value)}
                />
              </div>
            </div>

            <div className="modalActions">
              <button className="actionBtn ghost" type="button" onClick={() => setShowLeaseModal(false)}>
                Cancel
              </button>

              <button
                className="actionBtn"
                type="button"
                onClick={async () => {
                  // TODO: call server
                  try {
                    setErr("");
                    setActionMsg("Saving lease...");

                    const res = await fetch(`/api/properties/${leasePropId}/lease`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tenantName: leaseTenantName.trim(),
                        rentCents: Math.round(Number(leaseRentDollars || 0) * 100),
                        dueDay: Number(leaseDueDay || 1),
                      }),
                    });

                    const payload = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(payload?.message || `Lease HTTP ${res.status}`);

                    setShowLeaseModal(false);
                    setActionMsg("Lease saved.");
                    await loadProps();
                  } catch (e) {
                    const msg = e?.message || "Failed to save lease";
                    setErr(msg);
                    setActionMsg(msg);
                  }
                }}
              >
                Save
              </button>
            </div>

            <div className="meta" style={{ marginTop: 10 }}>
              Tip: leave tenant blank if you want “vacant” (we can add a Remove Lease button next).
            </div>
          </div>
        </div>
      )}




    </div>
  );
}