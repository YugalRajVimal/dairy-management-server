import mongoose from "mongoose";

// We need to ensure that `dps` and `bond` can be null,
// but when not null, they must be unique (sparse index).
// This is achieved by using `unique: true, sparse: true`.

const usedAssetsOfSubAdminSchema = new mongoose.Schema(
  {
    uploadedOn: { type: Date, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rt: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    can: { type: Number, default: 0 },
    lid: { type: Number, default: 0 },
    pvc: { type: Number, default: 0 },
    dps: { type: String, default: null, unique: true, sparse: true }, // allow null, unique when set
    dpsCount: { type: Number, default: 0 }, // Added field
    keyboard: { type: Number, default: 0 },
    printer: { type: Number, default: 0 },
    charger: { type: Number, default: 0 },
    stripper: { type: Number, default: 0 },
    solar: { type: Number, default: 0 },
    controller: { type: Number, default: 0 },
    ews: { type: Number, default: 0 },
    display: { type: Number, default: 0 },
    battery: { type: Number, default: 0 },
    bond: { type: String, default: null, unique: true, sparse: true }, // allow null, unique when set
    bondCount: { type: Number, default: 0 }, // Added field
    // vspSign: { type: Number, default: 0 },
    history: [
      {
        // stockNo: { type: String, default: "-" },
        rt: { type: String, default: "-" },
        // status: { type: String, default: "-" },
        // cStatus: { type: String, default: "-" },
        can: { type: String, default: "-" },
        lid: { type: String, default: "-" },
        pvc: { type: String, default: "-" },
        dps: { type: String, default: "-" },
        keyboard: { type: String, default: "-" },
        printer: { type: String, default: "-" },
        charger: { type: String, default: "-" },
        stripper: { type: String, default: "-" },
        solar: { type: String, default: "-" },
        controller: { type: String, default: "-" },
        ews: { type: String, default: "-" },
        display: { type: String, default: "-" },
        battery: { type: String, default: "-" },
        bond: { type: String, default: "-" },
        // vspSign: { type: String, default: "-" },
        changedOn: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

const UsedAssetsOfSubAdminModel = mongoose.model(
  "Used-Assets-To-Vendor",
  usedAssetsOfSubAdminSchema
);
export default UsedAssetsOfSubAdminModel;
