import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nickName: { type: String },
    vendorId: { type: String, unique: true, sparse: true },
    supervisorId: { type: String, unique: true, sparse: true },
    phoneNo: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    role: {
      type: String,
      enum: ["Admin", "SubAdmin", "Vendor", "Supervisor"], // Removed leading comma
      required: true,
    },
    address: {
      addressLine: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    zone: {
      type: String,
      unique: true,
    },
    route: {
      type: mongoose.Schema.Types.Mixed,
    },
    supervisorRoutes: [{ type: mongoose.Schema.Types.Mixed }],
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
    onboardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    disabled: { type: Boolean, default: false },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1, role: 1 }, { unique: true });
userSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-delete expired OTPs

const UserModel = mongoose.model("User", userSchema);
export default UserModel;
