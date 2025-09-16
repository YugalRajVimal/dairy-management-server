import mongoose from "mongoose";

const milkReportSchema = new mongoose.Schema(
  {
    uploadedOn: { type: Date, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    docDate: { type: Date, required: true },
    shift: { type: String,  required: true },
    vlcUploaderCode: { type: String, required: true },
    vlcName: { type: String, required: true },
    milkWeightLtr: { type: Number, required: true },
    fatPercentage: { type: Number, required: true },
    snfPercentage: { type: Number, required: true },
  },
  { timestamps: true }
);

const MilkReportModel = mongoose.model("MilkReport", milkReportSchema);
export default MilkReportModel;
