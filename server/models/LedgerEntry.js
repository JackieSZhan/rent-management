const mongoose = require("mongoose");

const LedgerEntrySchema = new mongoose.Schema(
  {
    period: { type: String, required: true }, // "YYYY-MM"
    propertyId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Property" },

    type: { type: String, required: true }, // CHARGE | PAYMENT | LATE_FEE | ADJUSTMENT
    subType: { type: String, required: true }, // RENT | LATE_FEE
    amountCents: { type: Number, required: true },
    postedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Prevent duplicate rent charge per property per period
LedgerEntrySchema.index(
  { period: 1, propertyId: 1, type: 1, subType: 1 },
  { unique: true, partialFilterExpression: { type: "CHARGE", subType: "RENT" } }
);

module.exports = mongoose.model("LedgerEntry", LedgerEntrySchema);