import express from "express";
import { auth } from "../middlewares/auth.js";
import { connectToXero, handleXeroCallback } from "../controllers/xeroController.js";

const xeroRouter = express.Router();

xeroRouter.get("/connect",auth, connectToXero);
xeroRouter.get("/callback", handleXeroCallback);

export default xeroRouter;
