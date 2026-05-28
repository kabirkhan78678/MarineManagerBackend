import express from "express";
import { activeStaffMembers, addStaffMember, changePassword, changePasswordApi, completeTask, createJobServiceSheet, deleteStaffMemberById, editStaffMember, forgotPassword, getAllMytasks, getAllStaffMembers, getCompletedTasks, getMyProfile, getTodayTasks, getTomorrowTask, getStaffMemberById, login, toggleStaffStatus, updateTaskTimer, verifyPassword,getTaskById, getAllParts } from "../controllers/staffController.js";
import { createJobServiceSheet as createSupplierJobServiceSheet } from "../controllers/supplierController.js";
import { auth } from "../middlewares/auth.js";
import { staffAuth } from "../middlewares/staffAuth.js";
import { supplierauth } from "../middlewares/supplierAuth.js";
import { upload } from "../middlewares/upload.js";

export const staffRouter = express.Router();

function jobServiceSheetAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.split(" ")[1];

    if (!token) {
        return staffAuth(req, res, next);
    }

    let payload = {};

    try {
        const encodedPayload = token.split(".")[1] || "";
        payload = JSON.parse(
            Buffer.from(encodedPayload, "base64url").toString("utf8") || "{}"
        );
    } catch (error) {
        return staffAuth(req, res, next);
    }

    if (payload.supplierId) {
        return supplierauth(req, res, () => createSupplierJobServiceSheet(req, res));
    }

    return staffAuth(req, res, next);
}

staffRouter.post('/addStaffMember', auth,addStaffMember);

staffRouter.post('/editStaffMember', auth,editStaffMember);

staffRouter.get('/staffMembers',auth, getAllStaffMembers);
staffRouter.get('/staffMember/:id', auth, getStaffMemberById);
staffRouter.delete('/   /:id', auth, deleteStaffMemberById);

staffRouter.get('/activeStaffMembers',auth, activeStaffMembers);

staffRouter.post('/toggleStatus/:id',auth, toggleStaffStatus);

staffRouter.post('/login', login);

staffRouter.post('/forgetPassword', forgotPassword);

staffRouter.get('/verifyPassword/:token', verifyPassword);

staffRouter.post("/changePassword", changePassword);

staffRouter.post("/change-password-api", staffAuth, changePasswordApi);

staffRouter.get('/getTodayTask', staffAuth, getTodayTasks);

staffRouter.get('/getTomorrowTask', staffAuth, getTomorrowTask);

staffRouter.get('/getAllTasks', staffAuth, getAllMytasks);

staffRouter.get('/getCompletedTasks', staffAuth, getCompletedTasks);

staffRouter.post('/JobServiceSheet', jobServiceSheetAuth, createJobServiceSheet);

staffRouter.post('/completeTask', staffAuth, upload.array('images', 10), completeTask);

staffRouter.get('/myProfile', staffAuth, getMyProfile);

staffRouter.post('/updateTaskTimer', staffAuth ,updateTaskTimer); 

staffRouter.post('/getTaskById', staffAuth, getTaskById);

staffRouter.get('/getAllParts', staffAuth, getAllParts);

staffRouter.get('/parts', staffAuth, getAllParts);
