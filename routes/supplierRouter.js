import express from "express";
import { auth } from "../middlewares/auth.js";
import { addSupplier, editSupplier , getAllSuppliers, getSupplierById, getTaskById, getJobDetailById, getCommencedTaskDetailById, login, forgotPassword, getTodayTasks, getTomorrowTask, getCompletedTasks,createJobServiceSheet, completeTask, verifyPassword,changePassword, changePasswordApi, getMyProfile, completeProfile, editProfile, getAllMytasks, deleteFile, respondToTaskOffer, getAllParts } from "../controllers/supplierController.js";
import { supplierauth } from "../middlewares/supplierAuth.js";
import { upload } from "../middlewares/upload.js";
import { profileupload } from "../middlewares/profile.js";
export const supplierRouter = express.Router();

supplierRouter.post('/addsupllier', auth, addSupplier);

supplierRouter.post('/editsupllier', auth, editSupplier); 

supplierRouter.get('/getAllSupplier',auth, getAllSuppliers);

supplierRouter.get('/getSupplierById/:id', auth, getSupplierById);

supplierRouter.post('/login', login);

supplierRouter.post('/forgetPassword',forgotPassword);

supplierRouter.get('/getTodayTask', supplierauth, getTodayTasks);

supplierRouter.get('/getTomorrowTask', supplierauth, getTomorrowTask);

supplierRouter.get('/getCompletedTasks', supplierauth, getCompletedTasks);

supplierRouter.post('/JobServiceSheet', supplierauth, createJobServiceSheet);

supplierRouter.post('/completeTask', supplierauth, upload.array('images', 10), completeTask);

supplierRouter.get('/verifyPassword/:token', verifyPassword);

supplierRouter.post("/changePassword", changePassword);

supplierRouter.post("/change-password-api", supplierauth, changePasswordApi);

supplierRouter.get('/myProfile', supplierauth, getMyProfile);

supplierRouter.post('/completeProfile',supplierauth, profileupload.fields([{ name: 'logo', maxCount: 1 }, { name: 'trade_license', maxCount: 1 },{ name: 'insurance'}]),completeProfile)

supplierRouter.post('/editProfile',supplierauth, profileupload.fields([{ name: 'logo', maxCount: 1 }, { name: 'trade_license', maxCount: 1 },{ name: 'insurance'}]),editProfile);

supplierRouter.delete('/deleteFile/:id',supplierauth, deleteFile);

supplierRouter.get('/getAllTasks', supplierauth, getAllMytasks);

supplierRouter.get('/getTaskById/:taskId', supplierauth, getTaskById);

supplierRouter.get('/getJobDetailById/:taskId', supplierauth, getJobDetailById);

supplierRouter.get('/getCommencedTaskDetailById/:taskId', supplierauth, getCommencedTaskDetailById);


supplierRouter.post('/respondToTaskOffer',supplierauth, respondToTaskOffer)

supplierRouter.get('/getAllParts', supplierauth, getAllParts);

supplierRouter.get('/parts', supplierauth, getAllParts);
