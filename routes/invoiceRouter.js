import express from "express";
import { auth } from "../middlewares/auth.js";
import { invoiceUpload, jobsheetUpload } from "../middlewares/upload.js";
import { generateInvoice, getAllBoatsWithCompletedTasks, getAllCompletedTaskByBoatId, getAllInvoices, getInvoiceById, sendPdfToBoatOwner, saveInvoicePdf, saveJobsheetPdf, getInvoiceByBoatId, getJobsheetByBoatId, pushInvoiceToXero } from "../controllers/invoiceController.js";

export const invoiceRouter = express.Router();

invoiceRouter.get('/getAllCompletedTask/:boatId', auth, getAllCompletedTaskByBoatId);

invoiceRouter.post('/generateInvoice', auth, generateInvoice);

invoiceRouter.get('/getInvoiceById/:id', auth, getInvoiceById);

invoiceRouter.post('/sendPdfToBoatOwner', auth, invoiceUpload.single('invoice'), sendPdfToBoatOwner);

invoiceRouter.get('/getAllBoatsWithCompletedTasks', auth, getAllBoatsWithCompletedTasks);

invoiceRouter.get('/getAllInvoices', auth, getAllInvoices);

invoiceRouter.post('/pushInvoiceToXero', auth, invoiceUpload.single('invoice'), pushInvoiceToXero);

// MVP1 Ventures
invoiceRouter.post('/saveInvoicePdf', auth, invoiceUpload.single('invoice'), saveInvoicePdf);
invoiceRouter.post('/saveJobsheetPdf', auth, jobsheetUpload.single('invoice'), saveJobsheetPdf);

// MVP1 Ventures
invoiceRouter.get('/getInvoiceByBoatId/:id', getInvoiceByBoatId);
invoiceRouter.get('/getJobsheetByBoatId/:id', getJobsheetByBoatId);