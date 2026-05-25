import express from "express";
import { createQuickLeads, getAllQuickLeads, getQuickLeads, deleteQuickLeads, getQuickLeadsRecurring, updateQuickLeads, updateRecurringTask } from '../controllers/QuickLeadsController.js';
import { auth } from "../middlewares/auth.js";
export const QuickLeadsRouter = express.Router();


QuickLeadsRouter.post('/addQuickLeads', auth, createQuickLeads);

QuickLeadsRouter.post('/updateQuickLeads', auth, updateQuickLeads);

QuickLeadsRouter.get('/getAllQuickLeads', auth, getAllQuickLeads);

QuickLeadsRouter.get('/getAllQuickLeads/:id', auth, getQuickLeads);
 
QuickLeadsRouter.delete('/deleteQuickLeads/:id', auth, deleteQuickLeads);

QuickLeadsRouter.get('/getDueRecurringTasks',auth, getQuickLeadsRecurring);

QuickLeadsRouter.post('/updateRecurringTask',auth, updateRecurringTask);