require("dotenv").config();
const mongoose = require("mongoose");
const Property = require("./models/Property");

// Seed script to insert demo properties into MongoDB.
async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  await Property.deleteMany({});

  await Property.insertMany([
    {
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
      address: "2507 Farnam St #12, Omaha, NE 68131",
      currentLease: null,
    },
    {
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
  ]);

  console.log("Seed done.");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});