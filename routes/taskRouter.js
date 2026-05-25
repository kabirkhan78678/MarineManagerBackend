import express from "express";
import { createTask, getAllTask, updateTask, getAllBoatsWithTasks, deleteTask, getAllTaskByBoatId, generateTask, getAllQuoteTasks, getQuoteTaskById, approveQuote, rejectQuote, assignTask, getJobManagementTasks, getJobDetailById } from '../controllers/taskController.js';
import { auth } from "../middlewares/auth.js";

export const taskRouter = express.Router();

taskRouter.post('/addTask', auth, createTask);

taskRouter.get('/getAllTask', auth, getAllTask);

taskRouter.get('/getAllBoatsWithTasks', auth, getAllBoatsWithTasks);

taskRouter.post('/updateTask', auth, updateTask);

taskRouter.delete('/deleteTask/:id', auth, deleteTask);

taskRouter.post('/getAllTaskByBoatId', auth, getAllTaskByBoatId);

taskRouter.post(
    "/generate-task",
    auth,
    generateTask
);
taskRouter.get(
    "/get-generated-tasks",
    auth,
    getAllQuoteTasks
);

taskRouter.get(
    "/get-generated-task/:taskId",
    auth,
    getQuoteTaskById
);

taskRouter.get("/approve/:taskId", approveQuote);
taskRouter.get("/reject/:taskId", rejectQuote);

taskRouter.post("/assignTask", auth, assignTask);

taskRouter.get(
    "/job-management",
    auth,
    getJobManagementTasks
);

taskRouter.get(
    "/getJobDetailById/:taskId",
    auth,
    getJobDetailById
);