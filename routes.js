import express from "express";
import adminRouter from "./Routers/admin.routes.js";
import authRouter from "./Routers/auth.routes.js";
import subAdminRouter from "./Routers/sub-admin.routes.js";
import vendorRouter from "./Routers/vendor.routes.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Welcome to EV App Server APIs");
});

router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/sub-admin", subAdminRouter);
router.use("/vendor", vendorRouter);

export default router;
