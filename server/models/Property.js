const mongoose = require("mongoose");

const TenantSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
  },
  { _id: false }
);

const LeaseSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    dueDay: { type: Number, required: true },
    rentCents: { type: Number, required: true },
    depositCents: { type: Number, default: 0 },
    tenant: { type: TenantSchema, default: null },
    lateFeeAmountCents: { type: Number, default: 0 },
    lateFeePercent: { type: Number, default: 0 },
    graceDays: { type: Number, default: 0 },
  },
  { _id: false }
);

const PropertySchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    currentLease: { type: LeaseSchema, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Property", PropertySchema);