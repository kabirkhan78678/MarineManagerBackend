import express from "express";
import { createBoat, getAllBoat, getBoatById, getBoatByRegistrationId, updateBoat, deleteBoat, updateInviteStatus, updateOwnerEmail } from '../controllers/boatController.js';
import { auth } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

export const boatRouter = express.Router();

// MVP1 Ventures
boatRouter.get('/getBoatByRegiratationId/:registrationId', getBoatByRegistrationId);

boatRouter.post('/addBoat', auth, upload.single("avatar_url"), createBoat);

boatRouter.get('/getAllBoat', auth, getAllBoat);

boatRouter.get('/getAllBoat/:id', auth, getBoatById);

boatRouter.post('/updateBoat', auth, upload.single("avatar_url"), updateBoat);

boatRouter.delete('/deleteBoat/:id', auth, deleteBoat);

// MVP1 Ventures
boatRouter.put('/updateInviteStatus/:id/:status', updateInviteStatus);

// MVP1 Ventures
boatRouter.put('/updateOwnerEmail/:id/:email', updateOwnerEmail);
