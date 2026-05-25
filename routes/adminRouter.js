import express from "express";
import { adminAuth } from "../middlewares/adminAuth.js";
import { profileupload } from "../middlewares/profile.js";
import {
  changePassword,
  createManagedUser,
  deleteManagedUser,
  forgotPassword,
  getAdminById,
  getAllBoats,
  getAllDocks,
  getAllJobs,
  getAllNotificationsForAdmin,
  getAllPlansForAdmin,
  getAllSubscriptionsForAdmin,
  getAllStaff,
  getAllSuppliers,
  getAllUsers,
  getBoatByIdForAdmin,
  blockUserByAdmin,
  unblockUserByAdmin,
  getDashboard,
  getDockByIdForAdmin,
  getJobById,
  getManagedUserById,
  getManagedUsers,
  getOwnerById,
  getPlanByIdForAdmin,
  getSubscriptionByIdForAdmin,
  getSupplierById,
  deleteSupplierById,
  getTechnicianById,
  getUserById,
  inviteManagedUser,
  login,
  myProfile,
  resetPassword,
  signup,
  updatePlanForAdmin,
  updateProfile,
  updateManagedUser,
  verifyPassword,
} from "../controllers/adminController.js";

export const adminRouter = express.Router();

adminRouter.post('/signup', profileupload.single("profile_image"), signup);
adminRouter.post('/login', login);
adminRouter.post('/forgetPassword', forgotPassword);
adminRouter.get('/verifyPassword/:token', verifyPassword);
adminRouter.post('/resetPassword', resetPassword);
adminRouter.get('/myProfile', adminAuth, myProfile);
adminRouter.post('/updateProfile', adminAuth, profileupload.single("profile_image"), updateProfile);
adminRouter.post('/changePassword', adminAuth, changePassword);
adminRouter.get('/dashboard', adminAuth, getDashboard);
adminRouter.get('/notifications', adminAuth, getAllNotificationsForAdmin);
adminRouter.get('/subscriptions', adminAuth, getAllSubscriptionsForAdmin);
adminRouter.get('/subscription/:id', adminAuth, getSubscriptionByIdForAdmin);
adminRouter.get('/users', adminAuth, getAllUsers);
adminRouter.get('/user/:id', adminAuth, getUserById);
adminRouter.post('/user/toggle-block', adminAuth, blockUserByAdmin);
adminRouter.post('/user/block/:id', adminAuth, blockUserByAdmin);
adminRouter.post('/user/unblock/:id', adminAuth, unblockUserByAdmin);
adminRouter.get('/business-users', adminAuth, getAllUsers);
adminRouter.get('/owner/:id', adminAuth, getOwnerById);
adminRouter.get('/admin/:id', adminAuth, getAdminById);
adminRouter.post('/managed-user/create', adminAuth, profileupload.single("profile_image"), createManagedUser);
adminRouter.get('/managed-users', adminAuth, getManagedUsers);
adminRouter.get('/managed-user/:id', adminAuth, getManagedUserById);
adminRouter.put('/managed-user/update/:id', adminAuth, profileupload.single("profile_image"), updateManagedUser);
adminRouter.delete('/managed-user/:id', adminAuth, deleteManagedUser);
adminRouter.post('/managed-user/invite', adminAuth, profileupload.single("profile_image"), inviteManagedUser);
adminRouter.get('/docks', adminAuth, getAllDocks);
adminRouter.get('/dock/:id', adminAuth, getDockByIdForAdmin);
adminRouter.get('/plans', adminAuth, getAllPlansForAdmin);
adminRouter.get('/plan/:id', adminAuth, getPlanByIdForAdmin);
adminRouter.put('/plan/:id', adminAuth, updatePlanForAdmin);
adminRouter.get('/jobs', adminAuth, getAllJobs);
adminRouter.get('/job/:id', adminAuth, getJobById);
adminRouter.get('/boats', adminAuth, getAllBoats);
adminRouter.get('/boat/:id', adminAuth, getBoatByIdForAdmin);
adminRouter.get('/staff', adminAuth, getAllStaff);
adminRouter.get('/technician/:id', adminAuth, getTechnicianById);
adminRouter.get('/suppliers', adminAuth, getAllSuppliers);
adminRouter.get('/supplier/:id', adminAuth, getSupplierById);
adminRouter.delete('/supplier/:id', adminAuth, deleteSupplierById);
