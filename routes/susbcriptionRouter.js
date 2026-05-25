import express from "express";
import { buyNewPlan, cancelSubscription, getAllPlans, getMySubscriptionHistory, getMySubscriptionOrTrail, upgradePlan } from "../controllers/subscriptionController.js";
import { auth } from "../middlewares/auth.js";
export const subscriptionRouter = express.Router();

subscriptionRouter.post('/cancelSubscription',auth,cancelSubscription);

subscriptionRouter.get('/allPlans',getAllPlans);

subscriptionRouter.post('/upgradeSubscription',auth,upgradePlan);

subscriptionRouter.post('/buyNewPlan',auth,buyNewPlan);

subscriptionRouter.get('/getMySubscriptionOrTrail',auth,getMySubscriptionOrTrail);

subscriptionRouter.get('/getMySubscriptionHistory',auth,getMySubscriptionHistory);
