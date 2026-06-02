import express from "express";
import {
  installPartOnBoat,
  getBoatParts,
  getBoatPartById,
  updateBoatPart,
  removeBoatPart,
  getWarrantyDashboard,
} from "../controllers/boatPartController.js";
import { auth } from "../middlewares/auth.js";

export const boatPartRouter = express.Router();

// Install part on boat
boatPartRouter.post("/boat-parts", auth, installPartOnBoat);

// Get all parts of a specific boat
boatPartRouter.get("/boat-parts/boat/:boatId", auth, getBoatParts);

// Warranty dashboard — all boats
boatPartRouter.get("/boat-parts/warranty-dashboard", auth, getWarrantyDashboard);

// Get single boat part
boatPartRouter.get("/boat-parts/:id", auth, getBoatPartById);

// Update boat part
boatPartRouter.put("/boat-parts/:id", auth, updateBoatPart);

// Remove part from boat
boatPartRouter.delete("/boat-parts/:id", auth, removeBoatPart);