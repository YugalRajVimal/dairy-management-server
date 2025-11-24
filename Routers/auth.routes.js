import express from "express";

import AuthController from "../Controllers/AuthController/auth.controller.js";
import jwtAuth from "../middlewares/Auth/auth.middleware.js";

const authRouter = express.Router();

const authController = new AuthController();

authRouter.post("/", jwtAuth, (req, res) => {
  authController.checkAuth(req, res);
});

authRouter.post("/signin", (req, res) => {
  authController.signin(req, res);
});

authRouter.post("/vendor-supervisor-signin", (req, res) => {
  authController.vendorSupervisorSignin(req, res);
});

authRouter.post("/vendor-supervisor-verify-account", (req, res) => {
  authController.vendorSupervisorVerifyAccount(req, res);
});

authRouter.post("/verify-account", (req, res) => {
  authController.verifyAccount(req, res);
});

export default authRouter;
