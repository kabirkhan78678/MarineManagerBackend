import express from "express";
import { auth } from "../middlewares/auth.js";

import {
    addService,
    getAllServices,
    getServiceById,
    updateService,
    deleteService
} from "../controllers/serviceController.js";

export const serviceRouter = express.Router();

// ==========================================
// SERVICE ROUTES
// ==========================================

serviceRouter.post("/addService", auth, addService);

serviceRouter.get("/getAllServices", auth, getAllServices);

serviceRouter.get("/getService/:id", auth, getServiceById);

serviceRouter.put("/updateService", auth, updateService);

serviceRouter.delete("/deleteService/:id", auth, deleteService);