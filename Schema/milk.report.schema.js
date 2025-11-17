import mongoose from "mongoose";
import { type } from "os";

const milkReportSchema = new mongoose.Schema(
  {
    uploadedOn: { type: Date, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    docDate: { type: Date, required: true },
    shift: { type: String, required: true },
    vlcUploaderCode: { type: String, required: true },
    vlcName: { type: String, required: true },
    milkWeightLtr: { type: Number, required: true },
    fatPercentage: { type: Number, required: true },
    snfPercentage: { type: Number, required: true },
    edited: { type: Boolean },
    history: [
      {
        docDate: { type: Date },
        shift: { type: String },
        vlcUploaderCode: { type: String},
        vlcName: { type: String },
        milkWeightLtr: { type: Number },
        fatPercentage: { type: Number },
        snfPercentage: { type: Number },
        editedOn: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

const MilkReportModel = mongoose.model("MilkReport", milkReportSchema);
export default MilkReportModel;
