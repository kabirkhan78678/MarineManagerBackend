import express from "express";
import { activeStaffMembers, addStaffMember, changePassword, completeTask, createJobServiceSheet, deleteStaffMemberById, editStaffMember, forgotPassword, getAllMytasks, getAllStaffMembers, getCompletedTasks, getMyProfile, getTodayTasks, getTomorrowTask, getStaffMemberById, login, toggleStaffStatus, updateTaskTimer, verifyPassword,getTaskById } from "../controllers/staffController.js";
import { auth } from "../middlewares/auth.js";
import { staffAuth } from "../middlewares/staffAuth.js";
import { upload } from "../middlewares/upload.js";

export const staffRouter = express.Router();

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

staffRouter.get('/getTodayTask', staffAuth, getTodayTasks);

staffRouter.get('/getTomorrowTask', staffAuth, getTomorrowTask);

staffRouter.get('/getAllTasks', staffAuth, getAllMytasks);

staffRouter.get('/getCompletedTasks', staffAuth, getCompletedTasks);

staffRouter.post('/JobServiceSheet', staffAuth, createJobServiceSheet);

staffRouter.post('/completeTask', staffAuth, upload.array('images', 10), completeTask);

staffRouter.get('/myProfile', staffAuth, getMyProfile);

staffRouter.post('/updateTaskTimer', staffAuth ,updateTaskTimer); 

staffRouter.post('/getTaskById', staffAuth, getTaskById);
