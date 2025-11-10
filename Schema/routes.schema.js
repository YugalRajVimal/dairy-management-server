import mongoose from "mongoose";

const routesSchema = new mongoose.Schema(
  {
    route: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const RoutesModel = mongoose.model("routes", routesSchema);
export default RoutesModel;
