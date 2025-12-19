const mockProperties = [
  { id: "p1", address: "1001 Dodge St, Omaha, NE 68102" },
  { id: "p2", address: "2507 Farnam St, Omaha, NE 68131" },
  { id: "p3", address: "8612 Maple St, Omaha, NE 68134" },
];

export default function PropertyList() {
  return (
    <div className="container">
      <h1>Property List</h1>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {mockProperties.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 12,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.65 }}>Property Address</div>
            <div style={{ marginTop: 6, fontWeight: 650 }}>{p.address}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
