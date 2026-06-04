import express from "express";
import { auth } from "../middlewares/auth.js";
import {
  createServiceCategory,
  getServiceCategories,
  getServiceCategoryById,
  updateServiceCategory,
  deleteServiceCategory,
  getActiveServiceCategories,
} from "../controllers/serviceCategoryController.js";

export const serviceCategoryRouter = express.Router();

 // Create Category
serviceCategoryRouter.post("/service-categories",auth,createServiceCategory);

// Get All Categories
serviceCategoryRouter.get("/service-categories", auth, getServiceCategories);

// Active Categories Dropdown
serviceCategoryRouter.get("/service-categories/active",auth,getActiveServiceCategories);

// Get Single Category
serviceCategoryRouter.get("/service-categories/:id",auth,getServiceCategoryById);

// Update Category
serviceCategoryRouter.put("/service-categories/:id",auth,updateServiceCategory);

//Delete Category
serviceCategoryRouter.delete("/service-categories/:id",auth,deleteServiceCategory  );

export default serviceCategoryRouter;