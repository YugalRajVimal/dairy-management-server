import mongoose from "mongoose";

const salesReportSchema = new mongoose.Schema(
  {
    uploadedOn: { type: Date, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    itemCode: { type: String, required: true },
    itemName: { type: String, required: true },
    vlcUploaderCode: { type: String, required: true },
    quantity: { type: Number, required: true },
    docDate: { type: Date, required: true },
    edited: { type: Boolean },
    history: [
      {
        itemCode: { type: String },
        itemName: { type: String },
        vlcUploaderCode: { type: String },
        quantity: { type: Number },
        docDate: { type: Date },
        editedOn: { type: Date },
      },
    ],
  },

  { timestamps: true }
);

const SalesReportModel = mongoose.model("SalesReport", salesReportSchema);
export default SalesReportModel;
