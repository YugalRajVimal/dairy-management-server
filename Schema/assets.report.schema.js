import mongoose from "mongoose";

const assetsReportSchema = new mongoose.Schema(
  {
    uploadedOn: { type: Date, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vlcCode: { type: String, required: true, unique: true },
    srNo: { type: String },
    stockNo: { type: String },
    rt: { type: Number, default: 0  },
    duplicate: { type: Number, default: 0  },
    vlcName: { type: String },
    status: { type: String },
    cStatus: { type: String },
    can: { type: Number, default: 0 },
    lid: { type: Number, default: 0 },
    pvc: { type: Number, default: 0 },
    dps: { type: String, default: 0, unique: true, sparse: true},
    keyboard: { type: Number, default: 0 },
    printer: { type: Number, default: 0 },
    charger: { type: Number, default: 0 },
    stripper: { type: Number, default: 0 },
    solar: { type: Number, default: 0 },
    controller: { type: Number, default: 0 },
    ews: { type: Number, default: 0 },
    display: { type: Number, default: 0 },
    battery: { type: Number, default: 0 },
    bond: { type: String, default: 0, unique: true, sparse: true },
    vspSign: { type: Number, default: 0 },
    history: [
      {
        srNo: { type: String, default: "-" },
        stockNo: { type: String, default: "-" },
        rt: { type: String, default: "-" },
        status: { type: String, default: "-" },
        cStatus: { type: String, default: "-" },
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
        vspSign: { type: String, default: "-" },
        changedOn: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

const AssetsReportModel = mongoose.model("AssetsReport", assetsReportSchema);
export default AssetsReportModel;
