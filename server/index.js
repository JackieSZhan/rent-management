const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

require("dotenv").config();
const mongoose = require("mongoose");

const Property = require("./models/Property");
const LedgerEntry = require("./models/LedgerEntry");

function newId(prefix = "e") {
  // Simple unique id generator for mock mode.
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function postedAtFromPeriod(periodYYYYMM, day = 1) {
  // Build a stable ISO timestamp using period (YYYY-MM) and day (1-31).
  const [yStr, mStr] = String(periodYYYYMM || "").split("-");
  const year = Number(yStr);
  const month = Number(mStr); // 1-12
  if (!year || !month) return new Date().toISOString();

  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);

  // Use UTC-ish ISO string to keep consistent ordering.
  const dt = new Date(Date.UTC(year, month - 1, safeDay, 9, 0, 0));
  return dt.toISOString();
}

// Build a stable ISO timestamp using period (YYYY-MM) and day (1-31).
function postedAtFromPeriod(periodYYYYMM, day = 1) {

  const [yStr, mStr] = String(periodYYYYMM || "").split("-");
  const year = Number(yStr);
  const month = Number(mStr); // 1-12
  if (!year || !month) return new Date();

  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);

  return new Date(Date.UTC(year, month - 1, safeDay, 9, 0, 0));
}

// Extract "YYYY-MM" from an ISO date string.
function periodFromISO(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Convert "123.45" -> 12345 (cents). Returns null if invalid.
function dollarsToCents(amount) {
  if (amount === null || amount === undefined) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}




// Mock properties (later replace with MongoDB)
const properties = [
  {
    id: "p1",
    address: "1001 Dodge St #3B, Omaha, NE 68102",
    currentLease: {
      startDate: "2025-10-01",
      endDate: "2026-09-30",
      dueDay: 1,
      rentCents: 135000,
      depositCents: 135000,
      tenant: { fullName: "John Smith", phone: "(402) 555-0188", email: "john.smith@email.com" },
    },
  },
  {
    id: "p2",
    address: "2507 Farnam St #12, Omaha, NE 68131",
    currentLease: null,
  },
  {
    id: "p3",
    address: "8612 Maple St #2A, Omaha, NE 68134",
    currentLease: {
      startDate: "2025-06-01",
      endDate: "2026-05-31",
      dueDay: 5,
      rentCents: 98000,
      depositCents: 98000,
      tenant: { fullName: "Emily Chen", phone: "(402) 555-0123", email: "emily.chen@email.com" },
    },
  },
];

// Mock ledger for rent summary/activities
const ledger = [
  // 2025-12
  { id: "e1", period: "2025-12", propertyId: "p1", type: "CHARGE", subType: "RENT", amountCents: 135000, postedAt: "2025-12-01T09:00:00Z" },
  { id: "e2", period: "2025-12", propertyId: "p1", type: "PAYMENT", subType: "RENT", amountCents: -80000, postedAt: "2025-12-10T18:00:00Z" },
  { id: "e3", period: "2025-12", propertyId: "p1", type: "LATE_FEE", subType: "LATE_FEE", amountCents: 5000, postedAt: "2025-12-12T09:00:00Z" },

  { id: "e4", period: "2025-12", propertyId: "p3", type: "CHARGE", subType: "RENT", amountCents: 98000, postedAt: "2025-12-01T09:00:00Z" },
  { id: "e5", period: "2025-12", propertyId: "p3", type: "LATE_FEE", subType: "LATE_FEE", amountCents: 5000, postedAt: "2025-12-12T09:00:00Z" },

  // 2026-01 (to verify period switching)
  { id: "e6", period: "2026-01", propertyId: "p1", type: "CHARGE", subType: "RENT", amountCents: 135000, postedAt: "2026-01-01T09:00:00Z" },
  { id: "e7", period: "2026-01", propertyId: "p1", type: "PAYMENT", subType: "RENT", amountCents: -135000, postedAt: "2026-01-03T14:00:00Z" },
];

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Properties list
app.get("/api/properties", async (req, res) => {
  const items = await Property.find().sort({ createdAt: -1 });
  res.json(items);
});

// Property detail
app.get("/api/properties/:id", async(req, res) => {
  const item = await Property.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Not found" });
  res.json(item);
});

// Rent summary by period (rent-only totals)
app.get("/api/rent/summary", (req, res) => {
  const period = String(req.query.period || "");

  const periodRows = ledger.filter((e) => (period ? e.period === period : true));
  const rentOnly = periodRows.filter((e) => e.subType === "RENT");

  const totalDue = rentOnly.filter((e) => e.type === "CHARGE").reduce((s, e) => s + e.amountCents, 0);
  const totalPaid = rentOnly.filter((e) => e.type === "PAYMENT").reduce((s, e) => s + Math.abs(e.amountCents), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);

  res.json({ period, totalDue, totalPaid, outstanding });
});

// Rent activities by period
app.get("/api/rent/activities", async (req, res) => {
  const period = String(req.query.period || "").trim();
  const q = period ? { period } : {};

  const items = await LedgerEntry.find(q).sort({ postedAt: -1 });
  res.json(items);
});

// Generate rent charges for a period
app.post("/api/rent/generate-charges", async (req, res) => {
  const { period } = req.body || {};
  const p = String(period || "").trim();

  if (!p || !/^\d{4}-\d{2}$/.test(p)) {
    return res.status(400).json({ message: "period must be in YYYY-MM format" });
  }

  const occupied = await Property.find({ currentLease: { $ne: null } });

  const created = [];
  const skipped = [];

  for (const prop of occupied) {
    const rentCents = prop.currentLease?.rentCents;
    if (!Number.isFinite(rentCents) || rentCents <= 0) {
      skipped.push({ propertyId: prop._id, reason: "missing_or_invalid_rentCents" });
      continue;
    }

    try {
      const entry = await LedgerEntry.create({
        period: p,
        propertyId: prop._id,
        type: "CHARGE",
        subType: "RENT",
        amountCents: rentCents,
        postedAt: postedAtFromPeriod(p, 1),
      });
      created.push(entry);
    } catch (e) {
      // Duplicate means it already exists (due to unique index)
      skipped.push({ propertyId: prop._id, reason: "already_exists" });
    }
  }

  res.status(201).json({
    period: p,
    occupiedCount: occupied.length,
    createdCount: created.length,
    skippedCount: skipped.length,
    skipped,
    created,
  });
});


// Record a rent payment
function periodFromISO(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function dollarsToCents(amount) {
  if (amount === null || amount === undefined) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

app.post("/api/rent/payments", async (req, res) => {
  const { propertyId, amountDollars, postedAt } = req.body || {};
  if (!propertyId) return res.status(400).json({ message: "propertyId is required" });

  const cents = dollarsToCents(amountDollars);
  if (cents === null || cents <= 0) {
    return res.status(400).json({ message: "amountDollars must be a positive number" });
  }

  const prop = await Property.findById(propertyId);
  if (!prop) return res.status(404).json({ message: "Property not found" });

  const iso = postedAt ? new Date(postedAt) : new Date();
  const period = periodFromISO(iso);

  const entry = await LedgerEntry.create({
    period,
    propertyId: prop._id,
    type: "PAYMENT",
    subType: "RENT",
    amountCents: -Math.abs(cents),
    postedAt: iso,
  });

  res.status(201).json(entry);
});



// Start server
const PORT = 3000;
async function start() {
  // Connect to MongoDB before starting the server.
  await mongoose.connect(process.env.MONGO_URI);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
