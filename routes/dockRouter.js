import express from "express";
import { createDock, getAllDock, getDockById, updateDock, deleteDock, availableBoats, assignDockBooking, getDockOccupancy, getDockUtilization, getFilteredDocks } from '../controllers/dockController.js';
import { auth } from "../middlewares/auth.js";
export const dockRouter = express.Router();


dockRouter.post('/addDock', auth, createDock);

dockRouter.get('/getAllDock', auth, getAllDock);

dockRouter.get('/getAllDock/:id', auth, getDockById);

dockRouter.post('/updateDock', auth, updateDock);

dockRouter.delete('/deleteDock/:id', auth, deleteDock);

dockRouter.get('/availableBoats', auth, availableBoats);

dockRouter.post('/assignBoat', auth, assignDockBooking);

dockRouter.get('/dock-occupancy', auth, getDockOccupancy);

dockRouter.get('/dock-utilization', auth, getDockUtilization);

dockRouter.get('/getFilteredDocks', auth, getFilteredDocks);
