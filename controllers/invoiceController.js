import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import Joi from "joi";
import hbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import { MessageEnum } from "../config/message.js";
import dotenv from 'dotenv';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path';
dotenv.config();
const baseurl = process.env.BASE_URL;
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
import { generateRandomUICNumber, getDateRanges, getValidAccessTokenForAdmin } from '../utils/helper.js';
import { sendEmail } from '../utils/sendMail.js';
import fs from 'fs';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
// Email transporter setup
var transporter = nodemailer.createTransport({
    host: "email-smtp.ap-southeast-2.amazonaws.com",
    port: 465,
    auth: {
        user: "AKIATRNH4WSLN3EJRKHX",
        pass: "BGInerDiW6ZTl62fSQ45ueA2Eg8pZ1G/Si1FAOH+9t5f",
    },
    tls: {
        rejectUnauthorized: false, // This allows self-signed certificates
    },
});


const handlebarOptions = {
    viewEngine: {
        partialsDir: path.resolve(__dirname, "../view/"),
        defaultLayout: false,
    },
    viewPath: path.resolve(__dirname, "../view/"),
};

transporter.use("compile", hbs(handlebarOptions));






export async function getAllCompletedTaskByBoatId(req, res) {
    try {

        const {
            boatId,
        } = req.params;

        const schema = Joi.object({
            boatId: Joi.number().integer().required(),
        });
        const { error } = schema.validate(req.params);
        if (error) {
            const message = error.details.map((i) => i.message).join(", ");
            return res.status(400).json({
                message: message,
                missingParams: error.details[0].message,
                status: 400,
                success: false,
            });
        }

        const task = await prisma.task.findMany({
            where: {
                userId: req.user.id,
                boatId: parseInt(boatId),
                status: 1
            },
            include: {
                boat: true,
                supplier: true,
                staff: true,
                JobServiceSheet: {
                    include: {
                        Material: true
                    }
                }
            },
            orderBy: {
                date_scheduled_from: 'desc',
            },
        });





        // console.log("filteredTasks>>>>>>>",filteredTasks)

        return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, task);

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

export const generateInvoice = async (req, res) => {
    try {
        const { boatId, pleasePayByDate } = req.body;

        const schema = Joi.object({
            boatId: Joi.number().required(),
            pleasePayByDate: Joi.date().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            const message = error.details.map((i) => i.message).join(", ");
            return res.status(400).json({
                message: message,
                missingParams: error.details[0].message,
                status: 400,
                success: false,
            });
        }

        // Fetch completed tasks
        const completedTasks = await prisma.task.findMany({
            where: { boatId: parseInt(boatId), status: 1, invoiceId: null },
            include: {
                JobServiceSheet: {
                    include: {
                        Material: true
                    }
                }
            }
        });

        if (completedTasks.length === 0) {
            return res.status(400).json({ message: "No completed tasks available for invoicing." });
        }

        // Calculate total amount (sum of quoted values)
        // const totalAmount = completedTasks.reduce((sum, task) => {
        //     return sum + (parseFloat(task.quoted_value) || 0); // Convert string to float
        // }, 0);
        let totalAmount = 0;

        completedTasks.forEach((task) => {
            const quotedValue = parseFloat(task.quoted_value) || 0;

            // Sum up all material costs under the JobServiceSheet
            const materialCost = task.JobServiceSheet.reduce((sum, jobSheet) => {
                return sum + jobSheet.Material.reduce((mSum, material) => mSum + parseFloat(material.totalPrice) || 0, 0);
            }, 0);

            totalAmount += materialCost;
        });
        // Apply 10% tax
        const totalAmountAfterTax = totalAmount * 1.1; // 10% tax added

        const invoiceNumber = crypto.randomInt(10000000, 99999999).toString();
        console.log(invoiceNumber);

        // Create Invoice
        const invoice = await prisma.invoice.create({
            data: {
                boatId: parseInt(boatId),
                userId: req.user.id,
                pleasePayByDate: new Date(pleasePayByDate),
                totalAmount: totalAmount,
                invoiceNumber: invoiceNumber,
                totalAmountAfterTax: totalAmountAfterTax,
                tasks: {
                    connect: completedTasks.map((task) => ({ id: task.id })),
                },
            },
        });

        // Mark tasks as invoiced
        await prisma.task.updateMany({
            where: { id: { in: completedTasks.map((task) => task.id) } },
            data: { status: 4, invoiceId: invoice.id },
        });

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_CREATED, { invoiceId: invoice.id });

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

export const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("id", id);

        const invoiceId = Number(id);
        if (!id || Number.isNaN(invoiceId) || !Number.isInteger(invoiceId)) {
            return res.status(400).json({
                message: "Valid invoice id is required",
                status: 400,
                success: false,
            });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                boat: true,
                tasks: {
                    include: {
                        JobServiceSheet: {
                            include: {
                                Material: true,
                                staff: true,
                                supplier: true,
                            }
                        },
                        TaskPhoto: true,
                        supplier: true,
                        staff: true,
                        TaskServices: true,
                    },
                },
                user: true
            },
        });

        if (!invoice) {
            return res.status(404).json({
                message: "Invoice Not found",
                status: 404,
                success: false,
            });
        }

        const totalServices = invoice.tasks.reduce((sum, task) => sum + (task.TaskServices?.length || 0), 0);
        const serviceNames = invoice.tasks.flatMap((task) =>
            (task.TaskServices || []).map((service) => service.serviceName)
        );
        const uniqueServices = [...new Set(serviceNames)].filter(Boolean);

        const totalPartsCost = invoice.tasks.reduce((sum, task) => {
            return sum + task.JobServiceSheet.reduce((sheetSum, jobSheet) => {
                return sheetSum + jobSheet.Material.reduce((mSum, material) => mSum + (parseFloat(material.totalPrice) || 0), 0);
            }, 0);
        }, 0);

        const totalServiceCost = invoice.tasks.reduce((sum, task) => {
            return sum + (task.TaskServices || []).reduce((serviceSum, service) => serviceSum + (parseFloat(service.servicePrice) || 0), 0);
        }, 0);

        const totalTechnicianCost = invoice.tasks.reduce((sum, task) => {
            const hours = parseFloat(task.time_alloted) || 0;
            const hourlyRate = task.staff?.hourly_rate || task.JobServiceSheet?.[0]?.staff?.hourly_rate || 0;
            return sum + hours * hourlyRate;
        }, 0);

        const jobSheetHourlyRate = invoice.tasks.reduce((rate, task) => {
            if (rate) return rate;
            const sheetHourlyRate = task.JobServiceSheet?.[0]?.staff?.hourly_rate;
            return sheetHourlyRate || task.staff?.hourly_rate || rate;
        }, null);

        const invoiceResponse = {
            ...invoice,
            serviceDetails: {
                totalServices,
                services: uniqueServices,
            },
            costBreakdown: {
                partsCost: totalPartsCost,
                serviceCost: totalServiceCost,
                technicianCost: totalTechnicianCost,
            },
            serviceSheetHourlyRate: jobSheetHourlyRate || null,
        };
        // let totalAmount = 0
        // await Promise.all(invoice.tasks.map((item)=>{
        //     totalAmount+=parseFloat(item.quoted_value);
        // }))
        // invoice.totalAmount = totalAmount;
        // const tax = (totalAmount % 10)/100
        // invoice.amountAfterTax = 

        if (invoiceResponse.user.company_logo) {
            invoiceResponse.user.company_logo = `${baseurl}/profile/${invoiceResponse.user.company_logo}`
        }
        if (invoiceResponse.user.trade_license) {
            invoiceResponse.user.trade_license = `${baseurl}/profile/${invoiceResponse.user.trade_license}`
        }

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_DATA, invoiceResponse);
    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

// MVP1 Ventures
export const getInvoiceByBoatId = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("id", id);

        const boatId = Number(id);
        if (!id || Number.isNaN(boatId) || !Number.isInteger(boatId)) {
            return res.status(400).json({
                message: "Valid boat id is required",
                status: 400,
                success: false,
            });
        }

        // First check if boat exists
        const boat = await prisma.boat.findUnique({
            where: { id: boatId }
        });

        if (!boat) {
            return res.status(404).json({
                message: "Boat not found",
                status: 404,
                success: false,
            });
        }

        // Then find invoices for this boat
        const invoices = await prisma.invoice.findMany({
            where: { boatId },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!invoices) {
            return res.status(404).json({
                message: "Invoice not found for this boat",
                status: 404,
                success: false,
            });
        }

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_DATA_BY_BOAT_ID, invoices);

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

// MVP1 Ventures
export const getJobsheetByBoatId = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("id", id);

        const boatId = Number(id);
        if (!id || Number.isNaN(boatId) || !Number.isInteger(boatId)) {
            return res.status(400).json({
                message: "Valid boat id is required",
                status: 400,
                success: false,
            });
        }

        // First check if boat exists
        const boat = await prisma.boat.findUnique({
            where: { id: boatId }
        });

        if (!boat) {
            return res.status(404).json({
                message: "Boat not found",
                status: 404,
                success: false,
            });
        }

        // Then find jobsheets for this boat
        const invoices = await prisma.JobServiceSheet.findMany({
            where: { boatId },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!invoices) {
            return res.status(404).json({
                message: "Jobsheet not found for this boat",
                status: 404,
                success: false,
            });
        }

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_DATA_BY_BOAT_ID, invoices);

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

// MVP1 Ventures - Updated
export const sendPdfToBoatOwner = async (req, res) => {
    try {
        const { boatId, invoiceId } = req.body;
        console.log("Boat ID:", boatId, "Invoice ID:", invoiceId);

        const schema = Joi.object({
            boatId: Joi.number().required(),
            invoiceId: Joi.number().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            const message = error.details.map((i) => i.message).join(", ");
            return res.status(400).json({
                message: message,
                missingParams: error.details[0].message,
                status: 400,
                success: false,
            });
        }

        const boat = await prisma.boat.findUnique({
            where: { id: parseInt(boatId) },
        });

        if (!boat) {
            return res.status(404).json({ message: "Boat not found." });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(invoiceId) },
        });

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        const formattedDate = invoice.pleasePayByDate.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        const originalname = boatId + '-' + invoiceId + '-BoatInvoice.pdf';
        const filePath = path.resolve('public/invoice', originalname);

        const file = req.file;

        let fileObj = {
            filename: file.originalname, // Original file name
            path: file.path, // Directly use the full file path
            contentType: file.mimetype
        }

        console.log('is Exist:', fs.existsSync(filePath));


        // File not found in directory
        if (!fs.existsSync(filePath)) {

            // Now file is required in formData
            if (!file) {
                return res.status(400).json({ message: "No file uploaded." });
            }

            fileObj = {
                filename: originalname, // Original file name
                path: path.resolve('public/invoice', originalname),
                contentType: "application/pdf"
            }

            // Add document link in Database
            const updatedInvoice = await prisma.invoice.update({
                where: { id: parseInt(invoiceId) },
                data: {
                    documentLink: req?.file?.path ? (req?.file?.path.startsWith('public/') ? req?.file?.path.replace('public/', '') : req?.file?.path) : null
                }
            });
        }

        const mailOptions = {
            from: "noreply@first-mate.net",
            to: boat.email,
            template: "invoice",
            subject: "Invoice for Your Boat",
            context: {
                invoiceNumber: invoice.invoiceNumber,
                pleasePayByDate: formattedDate,
                boatOwnerName: boat.owners_name,
                boatName: boat.name,
                totalAmountAfterTax: invoice.totalAmountAfterTax.toFixed(2),
            },
            attachments: []
        };

        mailOptions.attachments.push(fileObj);

        await sendEmail(mailOptions);

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_SEND_TO_OWNER, []);

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

// MVP1 Ventures
export const saveInvoicePdf = async (req, res) => {
    try {
        const { boatId, invoiceId } = req.body;

        const schema = Joi.object({
            boatId: Joi.number().required(),
            invoiceId: Joi.number().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            const message = error.details.map((i) => i.message).join(", ");
            return res.status(400).json({
                message: message,
                missingParams: error.details[0].message,
                status: 400,
                success: false,
            });
        }
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const boat = await prisma.boat.findUnique({
            where: { id: parseInt(boatId) },
        });

        if (!boat) {
            return res.status(404).json({ message: "Boat not found." });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(invoiceId) },
        });

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        // Add document link in Database
        const updatedInvoice = await prisma.invoice.update({
            where: { id: parseInt(invoiceId) },
            data: {
                documentLink: req?.file?.path ? (req?.file?.path.startsWith('public/') ? req?.file?.path.replace('public/', '') : req?.file?.path) : null
            }
        });

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_SAVED, updatedInvoice);

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

export const saveJobsheetPdf = async (req, res) => {
    try {
        const { boatId, invoiceId } = req.body;

        const schema = Joi.object({
            boatId: Joi.number().required(),
            invoiceId: Joi.number().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            const message = error.details.map((i) => i.message).join(", ");
            return res.status(400).json({
                message: message,
                missingParams: error.details[0].message,
                status: 400,
                success: false,
            });
        }
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const boat = await prisma.boat.findUnique({
            where: { id: parseInt(boatId) },
        });

        if (!boat) {
            return res.status(404).json({ message: "Boat not found." });
        }

        const invoice = await prisma.JobServiceSheet.findUnique({
            where: { id: parseInt(invoiceId) },
        });

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        // Add document link in Database
        const updatedInvoice = await prisma.JobServiceSheet.update({
            where: { id: parseInt(invoiceId) },
            data: {
                boatId: parseInt(boatId),
                documentLink: req?.file?.path ? (req?.file?.path.startsWith('public/') ? req?.file?.path.replace('public/', '') : req?.file?.path) : null
            }
        });

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_SAVED, updatedInvoice);

    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

export const getAllBoatsWithCompletedTasks = async (req, res) => {
    try {
        const boatsWithTasks = await prisma.boat.findMany({
            where: {
                userId: req.user.id,
                Task: {
                    some: { status: 1 }, // Ensure only boats with tasks are fetched
                },
            },
            include: {
                Task: {
                    where: {
                        status: 1
                    }
                }, // Include all relate d tasks
            },
            orderBy: {
                id: 'asc',
            },
        });

        // Add "lastServiceDate" for each boat based on task completion dates
        const boatsWithLastServiceDate = boatsWithTasks.map((boat) => {
            const completedTasks = boat.Task.filter((task) => task.completed_at);
            const lastServiceDate = completedTasks.length
                ? new Date(
                    Math.max(...completedTasks.map((task) => new Date(task.completed_at)))
                )
                : null; // If no tasks are completed, set to null

            return {
                ...boat,
                lastServiceDate, // Add the last service date to the response
            };
        });

        const sortedBoats = boatsWithLastServiceDate.sort((a, b) => {
            const dateA = a.lastServiceDate ? new Date(a.lastServiceDate).getTime() : 0;
            const dateB = b.lastServiceDate ? new Date(b.lastServiceDate).getTime() : 0;

            // Replace 'desc' with 'asc' for ascending order
            const sortOrder = 'desc';
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        return createSuccessResponse(
            res,
            200,
            true,
            MessageEnum.BOATS_WITH_TASK_DATA,
            sortedBoats
        );
    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, 'Internal Server Error');
    }
};
export const getAllInvoices = async (req, res) => {
    try {
        const invoice = await prisma.invoice.findMany({
            where: { userId: req.user.id },
            include: {
                boat: true,
                tasks: {
                    include: {
                        JobServiceSheet: {
                            include: {
                                Material: true,
                            }
                        },
                        TaskPhoto: true,
                        supplier: true,
                        staff: true
                    },
                },
                user: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        await Promise.all(invoice.map((invoice) => {

            if (invoice.user.company_logo) {
                invoice.user.company_logo = `${baseurl}/profile/${invoice.user.company_logo}`
            }
            if (invoice.user.trade_license) {
                invoice.user.trade_license = `${baseurl}/profile/${invoice.user.trade_license}`
            }
        }))

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_DATA, invoice);
    } catch (error) {
        console.error(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};


export const pushInvoiceToXero = async (req, res) => {
    try {
        const { boatId, invoiceId } = req.body;

        const schema = Joi.object({
            boatId: Joi.number().required(),
            invoiceId: Joi.number().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            const message = error.details.map((i) => i.message).join(", ");
            return res.status(400).json({
                message: message,
                missingParams: error.details[0].message,
                status: 400,
                success: false,
            });
        }
        const file = req.file;

        // if (!file) {
        //     return res.status(400).json({ message: "No file uploaded." });
        // }

        const boat = await prisma.boat.findUnique({
            where: { id: parseInt(boatId) },
        });

        if (!boat) {
            return res.status(404).json({ message: "Boat not found." });
        }

        // const invoice = await prisma.invoice.findUnique({
        //     where: { id: parseInt(invoiceId) },
        // });

        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(invoiceId) },
            include: {
                tasks: {
                    include: {
                        JobServiceSheet: {
                            include: {
                                Material: true
                            }
                        }
                    }
                }
            }
        });

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        const formattedDate = invoice.pleasePayByDate.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
        const admin = await prisma.user.findUnique({
            where: {
                id: req.user.id
            }
        })
        const accessToken = await getValidAccessTokenForAdmin(admin.id)

        const lineItems = [];

        for (const task of invoice.tasks) {
            // Work carried out line
            if (task.JobServiceSheet && task.JobServiceSheet.length) {
                const js = task.JobServiceSheet[0];
                if (js.workCarriedOut) {
                    lineItems.push({
                        Description: js.workCarriedOut,
                        Quantity: 1,
                        UnitAmount: 0,          // maybe labour separately
                        AccountCode: "200",
                        // TaxType: "TAX001",
                        TaxType: "OUTPUT"
                    });
                }
                // Materials lines
                for (const m of js.Material) {
                    lineItems.push({
                        Description: m.materialName,
                        Quantity: m.unitsUsed,
                        UnitAmount: m.pricePerUnit,
                        AccountCode: "200",
                        //TaxType: "TAX001",
                        TaxType: "OUTPUT"
                    });
                }
            }
        }
        const tenantId = admin.xero_tenantId;
        const xeroInvoiceData = {
            Type: "ACCREC",
            Contact: {
                Name: boat.owners_name,
                EmailAddress: boat.email
            },
            InvoiceNumber: invoice.invoiceNumber,
            DueDate: invoice.pleasePayByDate.toISOString().split("T")[0],
            LineAmountTypes: "Exclusive", // Required for tax calculations
            // LineItems: [
            //     {
            //         Description: `Boat: ${boat.name}`,
            //         Quantity: 1,
            //         UnitAmount: invoice.totalAmountAfterTax,
            //         AccountCode: "400",  // Replace with a valid account code (REVENUE type from Xero)
            //         TaxType: "NONE"      // Add this to fix the missing TaxType error
            //     }
            // ],
            LineItems: lineItems,
            Status: "AUTHORISED"
        };


        // 3. Push to Xero Accounting API using access token

        try {
            const res = await axios.post('https://api.xero.com/api.xro/2.0/Invoices', { Invoices: [xeroInvoiceData] }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Xero-tenant-id': tenantId,
                    'Content-Type': 'application/json'
                }
            });
        } catch (err) {
            const xeroError = err.response?.data;
            console.error('Xero error:', err);

            // Safely log validation errors if they exist
            if (xeroError?.Elements?.[0]?.ValidationErrors) {
                console.log('Validation Errors:', xeroError.Elements[0].ValidationErrors);
            } else {
                console.log('No validation errors found in response.');
            }
        }

        return createSuccessResponse(res, 200, true, MessageEnum.INVOICE_PUSHED_TO_XERO, []);

    } catch (error) {
        console.error(error);

        // const xeroError = error.response?.data;
        // console.error('Xero error:', JSON.stringify(xeroError, null, 2));

        // let message = MessageEnum.INTERNAL_SERVER_ERROR;

        // if (xeroError?.Elements?.[0]?.ValidationErrors) {
        //     message = xeroError.Elements[0].ValidationErrors
        //         .map(e => e.Message)
        //         .join(", ");
        // } else if (xeroError?.Message) {
        //     message = xeroError.Message;
        // }

        // return createErrorResponse(res, 500, message);
        return createErrorResponse(res, 500, MessageEnum.XERO_VALIDATION_FAILED);
    }
};