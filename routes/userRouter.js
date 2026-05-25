import express from "express";
import { signup, verifyUserEmail, login, forgotPassword, verifyPassword, changePassword, editProfile, myProfile, deleteFile, updateJobServiceSheet, markTooltipSeen, getSupplierById, deleteSupplier, toggleTechnicianStatus, toggleSupplierStatus, changePasswordapi, getOwners, getSupplierWorkedBoats, getSupplierWorkedBoatById,  createPart,
  getAllParts,
  getPartById,
  updatePart,
  deletePart } from '../controllers/userController.js';
import { auth } from "../middlewares/auth.js";
import { profileupload } from "../middlewares/profile.js";
import {
    changePasswordValidation
} from '../validators/userValidation.js';

export const userRouter = express.Router();

userRouter.post('/signup', signup);

userRouter.get('/verifyUser/:id', verifyUserEmail);

userRouter.post('/login', login);

userRouter.post('/forgetPassword', forgotPassword);

userRouter.get('/verifyPassword/:token', verifyPassword);

userRouter.post('/changePassword', changePassword);

userRouter.post(
    '/change-password-api', changePasswordValidation, changePasswordapi)

userRouter.post('/editProfile', auth, profileupload.fields([{ name: 'profile_image', maxCount: 1 }, { name: 'logo', maxCount: 1 }, { name: 'trade_license', maxCount: 1 }, { name: 'insurance' }]), editProfile)

userRouter.get('/owners', auth, getOwners);

userRouter.get('/myProfile', auth, myProfile);

userRouter.delete('/deleteFile/:id', auth, deleteFile);

userRouter.post('/updateJobSheet', auth, updateJobServiceSheet)

userRouter.patch('/tooltip-seen', auth, markTooltipSeen)

userRouter.get('/supplier/:id', auth, getSupplierById)

userRouter.delete(
    "/supplier/:supplierId",
    auth,
    deleteSupplier
);

userRouter.patch(
    "/toggle-technician-status/:technicianId",
    auth,
    toggleTechnicianStatus
);

userRouter.patch(
    "/toggle-supplier-status/:supplierId",
    auth,
    toggleSupplierStatus
);


userRouter.get(
    '/supplier-boats/:supplierId',
    auth,
    getSupplierWorkedBoats
);

userRouter.get(
    '/supplier-boat/:boatId/:supplierId',
    auth,
    getSupplierWorkedBoatById
);

userRouter.post(
    '/parts',
    auth,
    profileupload.single('part_image'),
    createPart
);

userRouter.get(
    '/parts',
    auth,
    getAllParts
);

userRouter.get(
    '/parts/:id',
    auth,
    getPartById
);

userRouter.put(
    '/parts/:id',
    auth,
    profileupload.single('part_image'),
    updatePart
);

userRouter.delete(
    '/parts/:id',
    auth,
    deletePart
);