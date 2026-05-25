import express from "express";
import { auth } from "../middlewares/auth.js";
import { getMyNotifications, markAllRead, markAsRead } from "../controllers/notificationController.js";


export const notificationRouter = express.Router();

notificationRouter.get('/',auth,getMyNotifications);

notificationRouter.put('/',auth,markAllRead);

notificationRouter.patch('/:id',auth,markAsRead);


