const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

require("dotenv").config();
const mongoose = require("mongoose");

const Property = require("./models/Property");
const LedgerEntry = require("./models/LedgerEntry");

// Express 4 does not automatically catch async errors.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function newId(prefix = "e") {
  // Simple unique id generator for mock mode.
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function buildAddressString({ addressLine1, addressLine2, city, state, zipCode }) {
  const parts = [
    String(addressLine1 || "").trim(),
    String(addressLine2 || "").trim(),
    `${String(city || "").trim()}, ${String(state || "").trim()} ${String(zipCode || "").trim()}`.trim(),
  ].filter(Boolean);

  // Join line1/line2 and city/state/zip with ", ", similar to a mailing label.
  return parts.join(", ");
}

function normalizeAddressKey(s) {
  // Normalize for duplicate checks: trim, collapse whitespace, lowercase.
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function assertNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Properties list
app.get("/api/properties", asyncHandler(async (req, res) => {
  const items = await Property.find().sort({ createdAt: -1 }).lean();
  res.json(items);
}));

// Create property (vacant by default)
app.post(
  "/api/properties",
  asyncHandler(async (req, res) => {
    const { addressLine1, addressLine2, city, state, zipCode } = req.body || {};

    if (!assertNonEmptyString(addressLine1)) {
      return res.status(400).json({ message: "addressLine1 is required" });
    }
    if (!assertNonEmptyString(city)) {
      return res.status(400).json({ message: "city is required" });
    }
    if (!assertNonEmptyString(state)) {
      return res.status(400).json({ message: "state is required" });
    }
    if (!assertNonEmptyString(zipCode)) {
      return res.status(400).json({ message: "zipCode is required" });
    }

    const address = buildAddressString({ addressLine1, addressLine2, city, state, zipCode });
    const addressKey = normalizeAddressKey(address);

    // Soft duplicate prevention (works even if schema has no unique index).
    const existing = await Property.findOne({ addressKey }).lean();
    if (existing) {
      return res.status(409).json({ message: "Address already exists" });
    }

    const created = await Property.create({
      address,
      addressKey,
      addressLine1: String(addressLine1).trim(),
      addressLine2: String(addressLine2 || "").trim() || null,
      city: String(city).trim(),
      state: String(state).trim(),
      zipCode: String(zipCode).trim(),
      currentLease: null,
    });

    return res.status(201).json(created);
  })
);

// Property detail
app.get("/api/properties/:id", asyncHandler(async (req, res) => {
  const item = await Property.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ message: "Not found" });
  res.json(item);
}));

// Delete property (hard delete)
app.delete(
  "/api/properties/:id",
  asyncHandler(async (req, res) => {
    const deleted = await Property.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Not found" });

    // Also remove all ledger entries tied to this property (keep it simple; no audit).
    await LedgerEntry.deleteMany({ propertyId: deleted._id });

    return res.json({ ok: true });
  })
);

// Rent summary by period (rent-only totals)
app.get(
  "/api/rent/summary",
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || "").trim();
    const q = period ? { period, subType: "RENT" } : { subType: "RENT" };

    const items = await LedgerEntry.find({
      ...q,
      type: { $in: ["CHARGE", "PAYMENT", "ADJUSTMENT"] },
    }).lean();

    let totalDue = 0;
    let totalPaid = 0;

    for (const e of items) {
      const amt = Number(e.amountCents || 0);
      if (e.type === "CHARGE") totalDue += amt;
      else if (e.type === "PAYMENT") totalPaid += Math.abs(amt);
      else if (e.type === "ADJUSTMENT") {
        if (amt >= 0) totalDue += amt;
        else totalPaid += Math.abs(amt);
      }
    }

    const outstanding = Math.max(0, totalDue - totalPaid);
    res.json({ period, totalDue, totalPaid, outstanding });
  })
);

// Rent activities by period
app.get("/api/rent/activities", asyncHandler(async (req, res) => {
  const period = String(req.query.period || "").trim();
  const q = period ? { period } : {};

  const items = await LedgerEntry.find(q).sort({ postedAt: -1 });
  res.json(items);
}));

// Generate rent charges for a period
app.post("/api/rent/generate-charges", asyncHandler(async (req, res) => {
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
}));

// Validate "YYYY-MM"
function assertPeriodYYYYMM(period) {
  if (typeof period !== "string" || !/^\d{4}-\d{2}$/.test(period)) return false;
  const m = Number(period.slice(5, 7));
  return m >= 1 && m <= 12;
}

// Calculate outstanding rent (in cents) for a property within a period.
// Positive result means the tenant still owes money.
async function getOutstandingRentCents({ period, propertyId }) {
  const items = await LedgerEntry.find({
    period,
    propertyId,
    subType: "RENT",
    type: { $in: ["CHARGE", "PAYMENT", "ADJUSTMENT"] },
  }).lean();

  let due = 0;
  let paid = 0;

  for (const e of items) {
    const amt = Number(e.amountCents || 0);

    if (e.type === "CHARGE") {
      due += amt;
    } else if (e.type === "PAYMENT") {
      paid += Math.abs(amt);
    } else if (e.type === "ADJUSTMENT") {
      if (amt >= 0) due += amt;
      else paid += Math.abs(amt);
    }
  }

  return Math.max(0, due - paid);
}

// Generate late fees for a period (only for properties that still have outstanding rent).
// Rules:
// - lateFeePercent > 0 takes priority
// - else use lateFeeAmountCents
// - do not create duplicates for the same (period, propertyId)
app.post("/api/rent/generate-late-fees", async (req, res) => {
  try {
    const { period } = req.body || {};
    const p = String(period || "").trim();

    if (!assertPeriodYYYYMM(p)) {
      return res.status(400).json({ message: "period must be in YYYY-MM format" });
    }

    const props = await Property.find({ currentLease: { $ne: null } }).lean();
    let createdCount = 0;

    for (const prop of props) {
      const propertyId = prop._id;
      const lease = prop.currentLease || {};

      let pct = Number(lease.lateFeePercent || 0);
      const flat = Number(lease.lateFeeAmountCents || 0);

      // Allow both 0.05 (5%) and 5 (5%) inputs
      if (pct > 1) pct = pct / 100;

      // Skip if no late fee rule configured
      if (!(pct > 0) && !(flat > 0)) continue;

      // Skip if already has late fee for this period
      const exists = await LedgerEntry.findOne({
        period: p,
        propertyId,
        type: "LATE_FEE",
        subType: "LATE_FEE",
      }).lean();
      if (exists) continue;

      const outstanding = await getOutstandingRentCents({ period: p, propertyId });
      if (outstanding <= 0) continue;

      // For percent-based fee, compute from outstanding to keep it minimal and safe.
      // (Later you can switch to compute from total rent due if you prefer.)
      let feeCents = 0;
      if (pct > 0) feeCents = Math.round(outstanding * pct);
      else feeCents = flat;

      if (!Number.isFinite(feeCents) || feeCents <= 0) continue;

      await LedgerEntry.create({
        period: p,
        propertyId,
        type: "LATE_FEE",
        subType: "LATE_FEE",
        amountCents: feeCents,
        postedAt: new Date(),
      });

      createdCount += 1;
    }

    return res.json({ period: p, createdCount });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e?.message || "Failed to generate late fees" });
  }
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

app.post("/api/rent/payments", asyncHandler(async (req, res) => {
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
}));

// Delete a rent activity entry
app.delete("/api/rent/activities/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await LedgerEntry.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ message: "Entry not found" });

  return res.json({ ok: true });
}));

// Global error handler (keeps the server from crashing on async route errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err?.message || "Internal server error" });
});

// Start server
async function start() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }
  // Connect to MongoDB before starting the server.
  await mongoose.connect(process.env.MONGO_URI);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
