import express from "express";
import { auth } from "../middlewares/auth.js";
import { getAllStaffMembers, getDashBoard, tasksForTommorrow } from "../controllers/homeController.js";

export const homeRouter = express.Router();

homeRouter.get('/getHome',auth,getDashBoard);

homeRouter.get('/tasksForTommorrow',auth,tasksForTommorrow);

homeRouter.get('/staffMembers',auth,getAllStaffMembers);