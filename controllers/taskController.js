import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import Joi from "joi";
import hbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import { MessageEnum } from "../config/message.js";
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();
const baseurl = process.env.BASE_URL;
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
import { generateRandomUICNumber, getDateRanges, randomStringAsBase64Url } from '../utils/helper.js';
import { sendEmail } from '../utils/sendMail.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
// Email transporter setup
var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  auth: {
    // MVP1 Ventures
    user: "kabir.ctinfotech@gmail.com",
    pass: "sqee txeq lbga njvg",
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

function renderPage({ title, message, color }) {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f4f7fb;
          color: #1f2937;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .card {
          max-width: 520px;
          padding: 32px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
          text-align: center;
        }
        h1 {
          margin: 0 0 12px;
          color: ${color};
        }
        p {
          margin: 0;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
    </body>
  </html>`;
}

async function sendMails({ to, subject, html }) {
  await transporter.sendMail({
    from: "noreply@first-mate.net",
    to,
    subject,
    html,
  });
}

async function sendTaskAssignmentEmail({ recipient, role, task, companyName }) {
  const recipientName =
    recipient?.full_name ||
    [recipient?.first_name, recipient?.last_name].filter(Boolean).join(" ") ||
    (role === "supplier" ? "Supplier" : "Technician");

  const marineManagerLink =
    role === "supplier"
      ? "https://fmservicehub.com/maintenance-task"
      : "https://fmservicehub.com/login";

  return sendEmail({
    from: "noreply@first-mate.net",
    to: recipient?.email,
    subject: "Work Order Notification",
    template: "communication_email",
    context: {
      name: recipientName,
      company_name: companyName || "Marine Manager",
      marineManagerLink,
      taskId: task?.id,
      boatName: task?.boat?.name,
      jobNumber: task?.jobNumber,
    },
  });
}

function normalizeTaskServiceIds(payload = {}) {
  const rawServices =
    Array.isArray(payload.services)
      ? payload.services
      : Array.isArray(payload.serviceIds)
        ? payload.serviceIds
        : Array.isArray(payload.selectedServices)
          ? payload.selectedServices
          : [];

  const hasServicePayload =
    payload.services !== undefined ||
    payload.serviceIds !== undefined ||
    payload.selectedServices !== undefined;

  const serviceIds = [...new Set(
    rawServices
      .map((service) => {
        if (service && typeof service === "object") {
          return Number(service.serviceId ?? service.id);
        }

        return Number(service);
      })
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  return {
    hasServicePayload,
    serviceIds,
  };
}

async function fetchServicePresetRecords(serviceIds) {
  if (!serviceIds.length) {
    return [];
  }

  const selectedServices = await prisma.servicePreset.findMany({
    where: {
      id: {
        in: serviceIds,
      },
    },
    select: {
      id: true,
      serviceTitle: true,
      serviceCost: true,
    },
  });

  if (selectedServices.length !== serviceIds.length) {
    const foundIds = selectedServices.map((service) => service.id);
    const missingIds = serviceIds.filter((id) => !foundIds.includes(id));
    const error = new Error(`Some services were not found: [${missingIds.join(", ")}]`);
    error.statusCode = 404;
    throw error;
  }

  const serviceMap = new Map(
    selectedServices.map((service) => [service.id, service])
  );

  return serviceIds.map((serviceId) => serviceMap.get(serviceId));
}

function buildTaskServiceCreateData(taskId, selectedServices = []) {
  return selectedServices.map((service) => ({
    taskId,
    serviceId: service.id,
    serviceName: service.serviceTitle,
    servicePrice: Number(service.serviceCost || 0),
  }));
}

export const createTask = async (req, res) => {
  const {
    description,
    isRecurring,
    time_alloted,
    quoted_value,
    boatId,
    assignStaffId,
    supplierId,
    date_scheduled_from,
    date_scheduled_to,
    assigned_to,
    scheduled_start_time,
    supplierIds
  } = req.body;

  const schema = Joi.object({
    description: Joi.string().required(),
    time_alloted: Joi.string().required(),
    quoted_value: Joi.string().required(),
    isRecurring: Joi.number().integer().valid(0, 1).required().default(0),
    boatId: Joi.number().required(),
    assigned_to: Joi.string().valid('STAFF', 'OUTSOURCED').required(), // Enum validation
    assignStaffId: Joi.when('assigned_to', {
      is: 'STAFF',
      then: Joi.number().required(),
      otherwise: Joi.forbidden(),
    }),
    // supplierId: Joi.when('assigned_to', {
    //   is: 'OUTSOURCED',
    //   then: Joi.number().required(),
    //   otherwise: Joi.forbidden(),
    // }),
    supplierIds: Joi.when('assigned_to', {
      is: 'OUTSOURCED',
      then: Joi.array().items(Joi.number()).min(1).required(),
      otherwise: Joi.forbidden(),
    }),
    services: Joi.array().items(
      Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().pattern(/^\d+$/),
        Joi.object({
          id: Joi.alternatives().try(
            Joi.number().integer().positive(),
            Joi.string().pattern(/^\d+$/)
          ).optional(),
          serviceId: Joi.alternatives().try(
            Joi.number().integer().positive(),
            Joi.string().pattern(/^\d+$/)
          ).optional(),
        }).or("id", "serviceId"),
      )
    ).optional(),
    serviceIds: Joi.array().items(
      Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().pattern(/^\d+$/)
      )
    ).optional(),
    selectedServices: Joi.array().items(
      Joi.object({
        id: Joi.alternatives().try(
          Joi.number().integer().positive(),
          Joi.string().pattern(/^\d+$/)
        ).optional(),
        serviceId: Joi.alternatives().try(
          Joi.number().integer().positive(),
          Joi.string().pattern(/^\d+$/)
        ).optional(),
      }).or("id", "serviceId")
    ).optional(),
    date_scheduled_from: Joi.date().required(),
    date_scheduled_to: Joi.date().required(),
    scheduled_start_time: Joi.when('assigned_to', {
      is: 'STAFF',
      then: Joi.date().required(),
      otherwise: Joi.forbidden(),
    }),
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

  try {
    const { serviceIds } = normalizeTaskServiceIds(req.body);
    const selectedServices = await fetchServicePresetRecords(serviceIds);

    if (assigned_to === "STAFF") {
      const staffMember = await prisma.staff_Member.findFirst({
        where: {
          id: parseInt(assignStaffId),
          userId: req.user.id,
        },
      });

      if (!staffMember) {
        return res.status(400).json({
          success: false,
          message: "Assigned staff member not found for this user",
          status: 400,
        });
      }
    }

    let jobNumber;
    let isUnique = false;

    // Loop to ensure UIC is unique
    while (!isUnique) {
      jobNumber = await generateRandomUICNumber();
      const uniqueJobNumber = await prisma.task.findFirst({
        where: {
          jobNumber: jobNumber
        }
      });
      if (!uniqueJobNumber) {
        isUnique = true;
      }
    }
    const newTask = await prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          description,
          time_alloted,
          quoted_value,
          boatId: parseInt(boatId),
          assign_to: assigned_to,
          assignStaffId: assigned_to === 'STAFF' ? parseInt(assignStaffId) : null,
          //supplierId: assigned_to === 'OUTSOURCED' ? parseInt(supplierId) : null,
          isRecurring: parseInt(isRecurring),
          userId: req.user.id,
          date_scheduled_from: new Date(date_scheduled_from),
          date_scheduled_to: new Date(date_scheduled_to),
          scheduled_start_time: assigned_to === 'STAFF' ? new Date(scheduled_start_time) : null,
          jobNumber: jobNumber
        },
      });

      if (selectedServices.length) {
        await tx.taskService.createMany({
          data: buildTaskServiceCreateData(createdTask.id, selectedServices),
        });
      }

      return tx.task.findUnique({
        where: {
          id: createdTask.id,
        },
        include: {
          TaskServices: true,
        },
      });
    });
    const user = await prisma.user.findUnique({
      where: { id: newTask.userId },
    });

    console.log('user', user)

    const boat = await prisma.boat.findUnique({
      where: { id: parseInt(boatId) },
    });

    const taskForEmail = {
      ...newTask,
      boat,
    };

    console.log('boat', boat)

    const emailJobs = [];

    if (assigned_to === "OUTSOURCED") {
      const suppliers = await Promise.all(
        supplierIds.map(async (sid) => {
          await prisma.taskSupplierOffer.create({
            data: {
              taskId: newTask.id,
              supplierId: parseInt(sid),
              status: "PENDING",
            },
          });

          return prisma.supplier.findUnique({ where: { id: sid } });
        })
      );

      emailJobs.push(
        ...suppliers
          .filter(Boolean)
          .map((supplier) => ({
            role: "supplier",
            email: supplier.email,
            send: () => sendTaskAssignmentEmail({
              recipient: supplier,
              role: "supplier",
              task: taskForEmail,
              companyName: user?.company_name,
            }),
          }))
      );

      // const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(supplierId) } });

      // let mailOptions = {
      //   from: "kabir.ctinfotech@gmail.com",
      //   to: supplier.email,
      //   subject: `Work Order Notification`,
      //   template: "communication_email",
      //   context: {
      //     name: `${supplier.first_name && supplier.last_name ? `${supplier.first_name} ${supplier.last_name}` : 'Supplier'}`,
      //     company_name: user.company_name,
      //     marineManagerLink: "https://3.26.177.93/supplier",
      //   },
      // };

      // await sendEmail(mailOptions);

      // console.log('mailOptions', mailOptions)
      // if (!supplier) {
      //   return createErrorResponse(res, 404, MessageEnum.SUPPLIER_NOT_FOUND);
      // }
    }

    if (assigned_to === "STAFF") {
      const staffMember = await prisma.staff_Member.findFirst({
        where: {
          id: parseInt(assignStaffId),
          userId: req.user.id,
        },
      });

      if (!staffMember) {
        return createErrorResponse(res, 404, "Assigned staff member not found");
      }

      emailJobs.push({
        role: "technician",
        email: staffMember.email,
        send: () => sendTaskAssignmentEmail({
          recipient: staffMember,
          role: "technician",
          task: taskForEmail,
          companyName: user?.company_name,
        }),
      });
    }

    if (emailJobs.length > 0) {
      const emailResults = await Promise.allSettled(emailJobs.map((job) => job.send()));
      const failedEmails = emailResults
        .map((result, index) => ({ result, job: emailJobs[index] }))
        .filter(({ result }) => result.status === "rejected")
        .map(({ result, job }) => ({
          role: job.role,
          email: job.email,
          error: result.reason?.code || result.reason?.message || "Mail failed",
        }));

      if (failedEmails.length > 0) {
        return res.status(502).json({
          success: false,
          status: 502,
          message: "Task created, but one or more assignment emails failed",
          data: {
            taskId: newTask.id,
            failedEmails,
          },
        });
      }
    }
    return createSuccessResponse(res, 200, true, MessageEnum.TASK_CREATED, newTask);
  } catch (error) {
    console.error(error);

    if (error?.statusCode) {
      return createErrorResponse(res, error.statusCode, error.message);
    }

    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export async function getAllTask(req, res) {
  try {
    const { boatId } = req.query;

    const filterQuery = {
      ...(boatId && { boatId: parseInt(boatId) }),
      userId: req.user.id
    };

    const task = await prisma.task.findMany({
      where: filterQuery,
      include: {
        boat: true,
        JobServiceSheet: true,
        supplier: true,
        staff: true,
        TaskPhoto: true,
      },
      orderBy: [
        { date_scheduled_from: 'desc' },
        { id: 'desc' },
      ],
    });

    await Promise.all(task.map(async (item) => {
      await Promise.all(item.TaskPhoto.map((photo) => {
        photo.url = baseurl + '/boat/' + photo.url
      }))
    }))
    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, task);

  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const getAllBoatsWithTasks = async (req, res) => {
  try {

    const boatsWithTasks = await prisma.boat.findMany({
      where: {
        userId: req.user.id,

        Task: {
          some: {},
        },
      },

      include: {
        Task: true,
      },

      orderBy: {
        id: 'asc',
      },
    });

    // =========================
    // ADD LAST SERVICE DATE
    // =========================

    const boatsWithLastServiceDate =
      boatsWithTasks.map((boat) => {

        const completedTasks =
          boat.Task.filter(
            (task) => task.completed_at
          );

        const lastServiceDate =
          completedTasks.length
            ? new Date(
              Math.max(
                ...completedTasks.map(
                  (task) =>
                    new Date(
                      task.completed_at
                    )
                )
              )
            )
            : null;

        return {
          ...boat,

          lastServiceDate,
        };
      });

    // =========================
    // SORT BY LAST SERVICE DATE
    // =========================

    const sortedBoats =
      boatsWithLastServiceDate.sort(
        (a, b) => {

          const dateA =
            a.lastServiceDate
              ? new Date(
                a.lastServiceDate
              ).getTime()
              : 0;

          const dateB =
            b.lastServiceDate
              ? new Date(
                b.lastServiceDate
              ).getTime()
              : 0;

          const sortOrder = 'desc';

          return sortOrder === 'desc'
            ? dateB - dateA
            : dateA - dateB;
        }
      );

    // =========================
    // MAINTAINED BOATS UI DATA
    // =========================

    const maintainedBoats =
      sortedBoats.map((boat, index) => {

        return {

          serialNumber: index + 1,

          boatId: boat.id,

          boatName:
            boat.name || "-",

          rego:
            boat.rego || "-",

          boatDisplay:
            `${boat.rego || "-"} - ${boat.name || "-"}`,

          totalJobs:
            boat.Task?.length || 0,

          ownerName:
            boat.owners_name || "-",

          email:
            boat.email || "-",

          contactNumber:
            boat.phone_no || "-",

          lastServiced:
            boat.lastServiceDate
              ? new Date(
                boat.lastServiceDate
              ).toLocaleDateString(
                "en-GB"
              )
              : "-",

          lastServicedRaw:
            boat.lastServiceDate,

          ui: {
            showEyeAction: true,
          },
        };
      });

    // =========================
    // CALCULATE PENDING TASKS
    // =========================

    const pendingCount = sortedBoats.reduce((total, boat) => {
      return total + (boat.Task?.filter((task) => task.status < 4).length || 0);
    }, 0);

    // =========================
    // FINAL RESPONSE
    // =========================

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.BOATS_WITH_TASK_DATA,
      {

        maintained_boats:
          maintainedBoats,

        boats:
          sortedBoats,

        summary: {
          totalBoats:
            maintainedBoats.length,
          pending:
            pendingCount,
        },
      }
    );

  } catch (error) {

    console.error(error);

    return createErrorResponse(
      res,
      500,
      'Internal Server Error'
    );
  }
};

export const updateTask = async (req, res) => {
  const {
    description,
    time_alloted,
    quoted_value,
    boatId,
    date_scheduled_from,
    date_scheduled_to,
    status,
    completed_at,
    id,
    isRecurring,
  } = req.body;

  const schema = Joi.object({
    description: Joi.string().optional(),
    time_alloted: Joi.string().optional(),
    quoted_value: Joi.string().optional(),
    boatId: Joi.number().optional(),
    date_scheduled_from: Joi.date().optional(),
    date_scheduled_to: Joi.date().optional(),
    isRecurring: Joi.number().integer().valid(0, 1).optional(),
    id: Joi.number().integer().required(),
    completed_at: Joi.date().optional().allow(''),
    status: Joi.number().integer().optional(),
    services: Joi.array().items(
      Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().pattern(/^\d+$/),
        Joi.object({
          id: Joi.alternatives().try(
            Joi.number().integer().positive(),
            Joi.string().pattern(/^\d+$/)
          ).optional(),
          serviceId: Joi.alternatives().try(
            Joi.number().integer().positive(),
            Joi.string().pattern(/^\d+$/)
          ).optional(),
        }).or("id", "serviceId"),
      )
    ).optional(),
    serviceIds: Joi.array().items(
      Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().pattern(/^\d+$/)
      )
    ).optional(),
    selectedServices: Joi.array().items(
      Joi.object({
        id: Joi.alternatives().try(
          Joi.number().integer().positive(),
          Joi.string().pattern(/^\d+$/)
        ).optional(),
        serviceId: Joi.alternatives().try(
          Joi.number().integer().positive(),
          Joi.string().pattern(/^\d+$/)
        ).optional(),
      }).or("id", "serviceId")
    ).optional()
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

  try {
    const {
      hasServicePayload,
      serviceIds,
    } = normalizeTaskServiceIds(req.body);
    const selectedServices = await fetchServicePresetRecords(serviceIds);

    // Fetch existing task
    const task = await prisma.task.findUnique({
      where: {
        id: parseInt(id),
      },
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
        status: 404,
        success: false,
      });
    }

    // Update task
    const updatedTask = await prisma.$transaction(async (tx) => {
      const taskRecord = await tx.task.update({
        where: { id: parseInt(id) },
        data: {
          description: description !== null && description !== undefined ? description : task.description,
          time_alloted: time_alloted !== null && time_alloted !== undefined ? time_alloted : task.time_alloted,
          quoted_value: quoted_value !== null && quoted_value !== undefined ? quoted_value : task.quoted_value,
          boatId: boatId !== null && boatId !== undefined ? parseInt(boatId) : task.boatId,
          date_scheduled_from:
            date_scheduled_from !== null && date_scheduled_from !== undefined
              ? new Date(date_scheduled_from)
              : task.date_scheduled_from,
          date_scheduled_to:
            date_scheduled_to !== null && date_scheduled_to !== undefined
              ? new Date(date_scheduled_to)
              : task.date_scheduled_to,
          completed_at:
            completed_at !== null && completed_at !== undefined && completed_at !== ""
              ? new Date(completed_at)
              : task.completed_at,
          isRecurring: isRecurring !== null && isRecurring !== undefined ? parseInt(isRecurring) : task.isRecurring,
          status: status !== null && status !== undefined ? parseInt(status) : task.status,
        },
      });

      if (hasServicePayload) {
        await tx.taskService.deleteMany({
          where: {
            taskId: taskRecord.id,
          },
        });

        if (selectedServices.length) {
          await tx.taskService.createMany({
            data: buildTaskServiceCreateData(taskRecord.id, selectedServices),
          });
        }
      }

      return tx.task.findUnique({
        where: {
          id: taskRecord.id,
        },
        include: {
          TaskServices: true,
        },
      });
    });

    console.log("updatedTask", updatedTask);

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_UPDATED, updatedTask);
  } catch (error) {
    console.error(error);

    if (error?.statusCode) {
      return createErrorResponse(res, error.statusCode, error.message);
    }

    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const schema = Joi.alternatives(
      Joi.object({
        id: Joi.number().required(),
      })
    )
    console.log("param", req.params)
    const result = schema.validate(req.params);
    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    }
    const task = await prisma.task.findUnique({
      where: {
        id: parseInt(id)
      }
    })

    if (!task) {
      return createErrorResponse(res, 400, MessageEnum.TASK_NOT_FOUND, {})
    }

    await prisma.task.delete({
      where: { id: parseInt(id) }
    });

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DELETED, {})
  } catch (error) {
    console.log(error)
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR)
  }
};

export async function getAllTaskByBoatId(req, res) {
  try {


    const {
      boatId,
    } = req.body;

    const schema = Joi.object({
      boatId: Joi.number().integer().required(),
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

    const task = await prisma.task.findMany({
      where: {
        userId: req.user.id,
        boatId: parseInt(boatId)
      },
      include: {
        boat: true,
        supplier: true,
        staff: true
      },
      orderBy: {
        date_scheduled_from: 'desc',
      },
    });

    // const filteredTasks = task.filter((task) => {
    //   console.log("here")
    //   const taskDate = task.date_scheduled_to;
    //   console.log("taskDate>>>>",taskDate)
    //   console.log("task.boat.book_from>>>>",task.boat.book_from)
    //   console.log("task.boat.book_to>>>>",task.boat.book_to)
    //   return taskDate >= task.boat.book_from && taskDate <= task.boat.book_to;
    // });

    const filteredTasks = task.filter((task) => {
      console.log("Inside filter");
      if (!task.boat) {
        console.log("Boat data is missing for task:", task.id);
        return false;
      }

      const { date_scheduled_from, date_scheduled_to } = task;
      const { book_from, book_to } = task.boat;

      console.log("Task Date Scheduled From >>>>", date_scheduled_from);
      console.log("Task Date Scheduled To >>>>", date_scheduled_to);
      console.log("Boat Book From >>>>", book_from);
      console.log("Boat Book To >>>>", book_to);

      return (
        date_scheduled_from >= book_from &&
        date_scheduled_to <= book_to
      );
    });


    // console.log("filteredTasks>>>>>>>",filteredTasks)

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, filteredTasks);

  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export async function getAllTasks(req, res) {
  try {
    const { boatId } = req.query;

    const filterQuery = {
      ...(boatId && { boatId: parseInt(boatId) }),
      AND: [
        {
          date_scheduled_from: {
            gte: prisma.boat.fields.book_from
          }
        },
        {
          date_scheduled_to: {
            lte: prisma.boat.fields.book_to
          }
        }
      ]
    };


    const tasks = await prisma.task.findMany({
      where: {
        AND: [
          {
            date_scheduled_from: {
              gte: prisma.boat.fields.book_from
            }
          },
          {
            date_scheduled_to: {
              lte: prisma.boat.fields.book_to
            }
          }
        ]

      },
      include: {
        boat: true,
      },
      orderBy: {
        date_scheduled_from: 'desc',
      },
    });



    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, tasks);
  } catch (error) {
    console.error('Error in getAllTasks:', error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}


export async function generateTask(req, res) {
  try {
    // ── Auth Guard ────────────────────────────────────────────────────────────
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ── Input Validation ──────────────────────────────────────────────────────
    const { boatId, services } = req.body;

    if (!boatId || isNaN(Number(boatId))) {
      return res.status(400).json({
        success: false,
        message: "A valid Boat ID is required",
      });
    }

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one service",
      });
    }

    const parsedServiceIds = services.map(Number).filter((id) => !isNaN(id));
    if (parsedServiceIds.length !== services.length) {
      return res.status(400).json({
        success: false,
        message: "One or more service IDs are invalid",
      });
    }

    // ── Boat Fetch ────────────────────────────────────────────────────────────
    const boat = await prisma.boat.findFirst({
      where: { id: Number(boatId) },
    });

    if (!boat) {
      return res.status(404).json({
        success: false,
        message: "Boat not found",
      });
    }

    // ── Services Fetch ────────────────────────────────────────────────────────
    const selectedServices = await prisma.servicePreset.findMany({
      where: {
        id: { in: parsedServiceIds },
      },
    });

    if (!selectedServices.length) {
      return res.status(404).json({
        success: false,
        message: "No matching services found",
      });
    }

    // Guard: ensure all requested services were actually found
    if (selectedServices.length !== parsedServiceIds.length) {
      const foundIds = selectedServices.map((s) => s.id);
      const missingIds = parsedServiceIds.filter((id) => !foundIds.includes(id));
      return res.status(404).json({
        success: false,
        message: `Some services were not found: [${missingIds.join(", ")}]`,
      });
    }

    const normalizedServiceIds = [...parsedServiceIds].sort((a, b) => a - b);
    const existingPendingQuotes = await prisma.task.findMany({
      where: {
        userId,
        boatId: Number(boatId),
        ownerApprovalStatus: "PENDING",
        TaskServices: {
          some: {},
        },
      },
      include: {
        TaskServices: {
          select: {
            serviceId: true,
          },
          orderBy: {
            serviceId: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    const duplicateQuote = existingPendingQuotes.find((task) => {
      const existingIds = task.TaskServices.map((service) => service.serviceId);
      return (
        existingIds.length === normalizedServiceIds.length &&
        existingIds.every((id, index) => id === normalizedServiceIds[index])
      );
    });

    if (duplicateQuote) {
      return res.status(409).json({
        success: false,
        message: "A pending quote with the same services already exists for this boat",
        data: {
          taskId: duplicateQuote.id,
        },
      });
    }

    // ── Total Price Calculation ───────────────────────────────────────────────
    const totalPrice = selectedServices.reduce(
      (sum, service) => sum + Number(service.serviceCost),
      0
    );

    // ── Transaction: Create Task + TaskServices ───────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          boat: { connect: { id: Number(boatId) } },
          user: { connect: { id: userId } },
          description: `Quote generated for boat ${boat.name || boat.rego || boat.id}`,
          time_alloted: "0",
          quoted_value: totalPrice.toString(),
          assign_to: "STAFF",
          date_scheduled_from: new Date(),
          date_scheduled_to: new Date(),
        },
      });

      await tx.taskService.createMany({
        data: selectedServices.map((service) => ({
          taskId: task.id,
          serviceId: service.id,
          serviceName: service.serviceTitle,
          servicePrice: service.serviceCost,
        })),
      });

      return task;
    });

    // ── Approval / Rejection Links ────────────────────────────────────────────
    let warning = null;
    const baseUrl = process.env.BASE_URL_;

    if (!baseUrl) {
      console.error("BASE_URL_ environment variable is not set");
      warning = "Quote created, but approval email was skipped because BASE_URL_ is not configured";
    } else {
      try {
        const approveLink = `${baseUrl}/task/approve/${result.id}`;
        const rejectLink = `${baseUrl}/task/reject/${result.id}`;

        // ── Email Template Rendering ──────────────────────────────────────────────
        const emailTemplatePath = path.join(
          process.cwd(),
          "view",
          "boatQuoteApproval.ejs"
        );

        const htmlTemplate = await ejs.renderFile(emailTemplatePath, {
          ownerName: boat.owners_name || "Boat Owner",
          totalPrice,
          services: selectedServices.map((service) => ({
            serviceName: service.serviceTitle,
            servicePrice: service.serviceCost,
          })),
          approveLink,
          rejectLink,
        });

        // ── Send Email ────────────────────────────────────────────────────────────
        await sendMails({
          to: boat.email,
          subject: "Boat Service Quote Approval",
          html: htmlTemplate,
        });
      } catch (mailError) {
        console.error("[createQuoteTask] Email send failed:", mailError);
        warning = "Quote created, but approval email could not be sent";
      }
    }

    // ── Success Response ──────────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: warning || "Task created successfully",
      data: {
        taskId: result.id,
        boatId: Number(boatId),
        services: selectedServices.map((service) => ({
          serviceId: service.id,
          serviceName: service.serviceTitle,
          servicePrice: Number(service.serviceCost),
        })),
        totalPrice,
        quoted_value: totalPrice.toString(),
        createdAt: result.createdAt,
      },
      ...(warning && { warning }),
    });

  } catch (error) {
    console.error("[createQuoteTask] Unexpected error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred. Please try again later.",
    });
  }
}

export async function getAllQuoteTasks(req, res) {
  try {

    // ── Pagination ─────────────────────────────────────────────
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const skip = (page - 1) * limit;
    const quoteTaskFilter = {
      userId: req.user.id,
      TaskServices: {
        some: {}
      },
    };

    // ── Total Count ────────────────────────────────────────────
    const totalRecords = await prisma.task.count({
      where: quoteTaskFilter
    });

    // ── Fetch Quotes ───────────────────────────────────────────
    const quotes = await prisma.task.findMany({
      where: quoteTaskFilter,

      include: {
        boat: true,
        TaskServices: true,
      },

      orderBy: {
        id: "desc"
      },

      skip,
      take: limit
    });

    // ── Format Response ────────────────────────────────────────
    const formattedData = quotes.map((task) => ({
      taskId: task.id,

      rego: task.boat?.rego || "-",

      noOfServices: task.TaskServices.length,

      totalCost: task.quoted_value,

      dateSent: task.createdAt,

      status: task.ownerApprovalStatus || "PENDING"
    }));

    // ── Response ───────────────────────────────────────────────
    return res.status(200).json({
      success: true,

      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit
      },

      data: formattedData
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
export async function getQuoteTaskById(req, res) {
  try {

    // ── Params ────────────────────────────────────────────────
    const taskId = Number(req.params.taskId);

    if (!taskId || isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Valid Task ID is required"
      });
    }

    // ── Fetch Task ────────────────────────────────────────────
    const task = await prisma.task.findUnique({
      where: {
        id: taskId
      },

      include: {
        boat: true,
        TaskServices: {
          select: {
            id: true,
            serviceId: true,
            serviceName: true,
            servicePrice: true
          }
        }
      }
    });

    // ── Not Found ─────────────────────────────────────────────
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Quote task not found"
      });
    }

    if (!task.TaskServices.length) {
      return res.status(404).json({
        success: false,
        message: "Quote task not found"
      });
    }

    // ── Response Format ───────────────────────────────────────
    const responseData = {
      taskId: task.id,

      boatDetails: {
        boatId: task.boat?.id,
        rego: task.boat?.rego || "-",
        boatName: task.boat?.name || "-",
        ownerName: task.boat?.owners_name || "-",
        ownerEmail: task.boat?.email || "-"
      },

      totalServices: task.TaskServices.length,

      services: task.TaskServices.map((service) => ({
        taskServiceId: service.id,
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        servicePrice: Number(service.servicePrice)
      })),

      totalCost: task.quoted_value,

      ownerApprovalStatus:
        task.ownerApprovalStatus || "PENDING",

      createdAt: task.createdAt
    };

    // ── Success Response ──────────────────────────────────────
    return res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

export async function approveQuote(req, res) {
  try {
    const taskId = Number(req.params.taskId);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.send(
        renderPage({
          title: "Quote Not Found",
          message: "The requested quote does not exist.",
          color: "#dc2626",
        })
      );
    }

    // ✅ Better message instead of "Action already taken"
    if (task.ownerApprovalStatus === "APPROVED") {
      return res.send(
        renderPage({
          title: "Already Approved ✅",
          message: "You have already approved this quote earlier.",
          color: "#16a34a",
        })
      );
    }

    if (task.ownerApprovalStatus === "REJECTED") {
      return res.send(
        renderPage({
          title: "Already Rejected ❌",
          message: "This quote was already rejected earlier.",
          color: "#dc2626",
        })
      );
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { ownerApprovalStatus: "APPROVED" },
    });

    return res.send(
      renderPage({
        title: "Quote Approved ✅",
        message: "Your approval has been recorded successfully.",
        color: "#16a34a",
      })
    );
  } catch (error) {
    console.log(error);
    return res.send(
      renderPage({
        title: "Error",
        message: "Something went wrong. Please try again.",
        color: "#dc2626",
      })
    );
  }
}

export async function rejectQuote(req, res) {
  try {
    const taskId = Number(req.params.taskId);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.send(
        renderPage({
          title: "Quote Not Found",
          message: "The requested quote does not exist.",
          color: "#dc2626",
        })
      );
    }

    if (task.ownerApprovalStatus === "REJECTED") {
      return res.send(
        renderPage({
          title: "Already Rejected ❌",
          message: "You have already rejected this quote earlier.",
          color: "#dc2626",
        })
      );
    }

    if (task.ownerApprovalStatus === "APPROVED") {
      return res.send(
        renderPage({
          title: "Already Approved ✅",
          message: "This quote was already approved earlier.",
          color: "#16a34a",
        })
      );
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { ownerApprovalStatus: "REJECTED" },
    });

    return res.send(
      renderPage({
        title: "Quote Rejected ❌",
        message: "Your response has been recorded successfully.",
        color: "#dc2626",
      })
    );
  } catch (error) {
    console.log(error);
    return res.send(
      renderPage({
        title: "Error",
        message: "Something went wrong. Please try again.",
        color: "#dc2626",
      })
    );
  }
}


//By me 6 may
//task assginment according to new flow

export async function assignTask(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      taskId,
      assign_to, // "STAFF" | "OUTSOURCE"
      technicians, // array
      time_alloted,
      date_scheduled_from,
      date_scheduled_to,
      taskInfo,
      assigned_value,
    } = req.body;

    // ✅ Basic validation
    if (!taskId || !assign_to || !technicians?.length) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // ✅ Owner approval check
    if (task.ownerApprovalStatus !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Task not approved by owner",
      });
    }

    // =========================
    // 🔵 CASE 1: STAFF
    // =========================
    if (assign_to === "STAFF") {
      if (technicians.length !== 1) {
        return res.status(400).json({
          success: false,
          message: "Only one staff can be assigned",
        });
      }

      const staffId = Number(technicians[0]);

      const staff = await prisma.staff_Member.findFirst({
        where: {
          id: staffId,
          userId: userId,
          status: 1, // ✅ active only
        },
      });

      if (!staff) {
        return res.status(400).json({
          success: false,
          message: "Invalid or inactive staff",
        });
      }

      await prisma.task.update({
        where: { id: Number(taskId) },
        data: {
          assign_to: "STAFF",
          assignStaffId: staff.id,
          quoted_value: assigned_value?.toString(),
          time_alloted,
          date_scheduled_from: new Date(date_scheduled_from),
          date_scheduled_to: new Date(date_scheduled_to),
          taskInfo,
          status: 2, // assigned
        },
      });

      return res.json({
        success: true,
        message: "Task assigned to staff successfully",
      });
    }

    // =========================
    // 🟣 CASE 2: OUTSOURCE (SUPPLIER)
    // =========================
    if (assign_to === "OUTSOURCED") {
      const supplierIds = technicians.map(Number);

      const suppliers = await prisma.supplier.findMany({
        where: {
          id: { in: supplierIds },
          status: 1,

          // ✅ IMPORTANT: only user's suppliers
          UserSupplier: {
            some: {
              userId: userId,
            },
          },
        },
      });

      if (suppliers.length !== supplierIds.length) {
        return res.status(400).json({
          success: false,
          message: "Some suppliers are invalid",
        });
      }

      await prisma.$transaction(async (tx) => {
        // update task
        await tx.task.update({
          where: { id: Number(taskId) },
          data: {
            assign_to: "OUTSOURCED",
            quoted_value: assigned_value?.toString(),
            time_alloted,
            date_scheduled_from: new Date(date_scheduled_from),
            date_scheduled_to: new Date(date_scheduled_to),
            taskInfo,
            status: 1, // waiting for supplier approval
          },
        });

        // create offers for multiple suppliers
        await tx.taskSupplierOffer.createMany({
          data: suppliers.map((sup) => ({
            taskId: Number(taskId),
            supplierId: sup.id,
            offered_price: Number(assigned_value),
            status: "PENDING",
          })),
        });
      });

      return res.json({
        success: true,
        message: "Task sent to suppliers for approval",
      });
    }

    // ❌ invalid case
    return res.status(400).json({
      success: false,
      message: "Invalid assign_to value",
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}


export async function getJobManagementTasks(req, res) {
  try {

    const {
      search,
      status,
      assignmentType
    } = req.query;

    // =========================
    // FILTERS
    // =========================

    const whereCondition = {
      userId: req.user.id,
    };

    // Search by boat name or rego
    if (search) {
      whereCondition.boat = {
        OR: [
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            rego: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      };
    }

    // Assignment Type Filter
    if (assignmentType) {
      whereCondition.assign_to = assignmentType;
    }

    // =========================
    // FETCH TASKS
    // =========================

    const tasks = await prisma.task.findMany({
      where: whereCondition,

      include: {

        boat: true,

        supplier: true,

        staff: true,

        invoice: true,

        TaskServices: true,

        TaskSupplierOffer: {
          include: {
            supplier: true,
          },
        },
      },

      orderBy: {
        id: "desc",
      },
    });

    // =========================
    // FORMAT RESPONSE
    // =========================

    const formattedTasks = tasks.map((task) => {

      const dueDate = new Date(task.date_scheduled_to);

      const today = new Date();

      // =========================
      // TASK STATUS
      // =========================

      let taskStatus = {
        label: "PENDING",
        color: "#F59E0B",
      };

      // Completed
      if (task.status === 4) {

        taskStatus = {
          label: "COMPLETED",
          color: "#22C55E",
        };
      }

      // Overdue
      else if (dueDate < today) {

        taskStatus = {
          label: "OVERDUE",
          color: "#EF4444",
        };
      }

      // =========================
      // APPROVAL STATUS
      // =========================

      let approvalStatus = null;

      if (task.assign_to === "OUTSOURCED") {

        const firstOffer = task.TaskSupplierOffer?.[0];

        if (firstOffer?.status === "APPROVED") {

          approvalStatus = {
            label: "Accepted",
            color: "#22C55E",
          };
        }

        else if (firstOffer?.status === "REJECTED") {

          approvalStatus = {
            label: "Rejected",
            color: "#EF4444",
          };
        }

        else {

          approvalStatus = {
            label: "Pending",
            color: "#F59E0B",
          };
        }
      }

      // =========================
      // RETURN FORMATTED TASK
      // =========================

      return {

        taskId: task.id,

        cardType: task.assign_to,

        jobLabel: `JOB #${task.jobNumber || task.id}`,

        jobNumber: task.jobNumber || `#${task.id}`,

        boatName: task.boat?.name || "-",

        boatId: task.boat?.id || null,

        rego: task.boat?.rego || "-",

        assignedLabel:
          task.assign_to === "STAFF"
            ? "Technician"
            : "Supplier",

        assignedName:
          task.assign_to === "STAFF"
            ? task.staff?.full_name || "-"
            : task.TaskSupplierOffer?.[0]?.supplier?.full_name ||
            task.TaskSupplierOffer?.[0]?.supplier?.company_name ||
            "-",

        supplierStatus:
          task.assign_to === "OUTSOURCED"
            ? {
              label: approvalStatus?.label || "Pending",

              backgroundColor:
                approvalStatus?.label === "Accepted"
                  ? "#DCFCE7"
                  : approvalStatus?.label === "Rejected"
                    ? "#FEE2E2"
                    : "#FEF3C7",

              textColor:
                approvalStatus?.label === "Accepted"
                  ? "#22C55E"
                  : approvalStatus?.label === "Rejected"
                    ? "#EF4444"
                    : "#F59E0B",
            }
            : null,

        services: {

          count: task.TaskServices.length,

          label: `${task.TaskServices.length} Services`,

          items: task.TaskServices.map(
            (service) => service.serviceName
          ),

          previewText:
            task.TaskServices.length > 0
              ? task.TaskServices
                .map((service) => service.serviceName)
                .join(", ")
              : "No services added",
        },

        dueDate: new Date(task.date_scheduled_to)
          .toLocaleDateString("en-GB"),

        status: {
          label: taskStatus.label,

          dotColor: taskStatus.color,

          textColor: taskStatus.color,
        },

        quotedValue: task.quoted_value || "0",

        invoice: {

          exists: !!task.invoiceId,

          invoiceId: task.invoiceId || null,
        },

        ui: {

          showSupplierBadge:
            task.assign_to === "OUTSOURCED",

          showCompleted:
            taskStatus.label === "COMPLETED",

          showPending:
            taskStatus.label === "PENDING",

          showOverdue:
            taskStatus.label === "OVERDUE",

          isStaffTask:
            task.assign_to === "STAFF",

          isOutsourcedTask:
            task.assign_to === "OUTSOURCED",
        },

        createdAt: task.createdAt,
      };
    });

    // =========================
    // STATUS FILTER
    // =========================

    let filteredTasks = formattedTasks;

    if (status) {

      filteredTasks = formattedTasks.filter(
        (item) => item.status.label === status
      );
    }

    // =========================
    // COUNTS
    // =========================

    const counts = {

      total: filteredTasks.length,

      completed: filteredTasks.filter(
        (x) => x.status.label === "COMPLETED"
      ).length,

      pending: filteredTasks.filter(
        (x) => x.status.label === "PENDING"
      ).length,

      overdue: filteredTasks.filter(
        (x) => x.status.label === "OVERDUE"
      ).length,
    };

    // =========================
    // FINAL RESPONSE
    // =========================

    return res.status(200).json({

      success: true,

      message: "Job management data fetched successfully",

      counts,

      data: filteredTasks,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({

      success: false,

      message: error.message,
    });
  }
}


export const getJobDetailById = async (req, res) => {
  try {

    const taskId = Number(req.params.taskId);

    // =========================
    // VALIDATION
    // =========================

    if (!taskId) {

      return createErrorResponse(
        res,
        400,
        "Task id is required"
      );
    }

    // =========================
    // FETCH TASK
    // =========================

    const task = await prisma.task.findFirst({

      where: {
        id: taskId,
        userId: req.user.id,
      },

      include: {

        boat: true,

        user: true,

        staff: true,

        supplier: true,

        invoice: true,

        TaskPhoto: true,

        TaskServices: true,

        JobServiceSheet: true,

        TaskSupplierOffer: {
          include: {
            supplier: true,
          },
        },
      },
    });

    // =========================
    // NOT FOUND
    // =========================

    if (!task) {

      return createErrorResponse(
        res,
        404,
        "Task not found"
      );
    }

    // =========================
    // TASK STATUS
    // =========================

    let taskStatus = {
      label: "PENDING",
      color: "#F59E0B",
      number: 1,
    };

    // COMPLETED
    if (
      task.status === 4 ||
      task.completed_at
    ) {

      taskStatus = {
        label: "COMPLETED",
        color: "#22C55E",
        number: 4,
      };
    }

    // OVERDUE
    else if (
      task.date_scheduled_to &&
      new Date(task.date_scheduled_to) < new Date()
    ) {

      taskStatus = {
        label: "OVERDUE",
        color: "#EF4444",
        number: 3,
      };
    }

    // =========================
    // ASSIGNED USER
    // =========================

    let assignedUser = null;

    if (task.assign_to === "STAFF") {

      assignedUser = {

        type: "TECHNICIAN",

        id:
          task.staff?.id || null,

        name:
          task.staff?.full_name || "-",

        email:
          task.staff?.email || "-",

        phone:
          task.staff?.phone_no || "-",

        profileImage:
          task.staff?.profile_image || null,
      };
    }

    else {

      const supplier =
        task.TaskSupplierOffer?.[0]?.supplier;

      assignedUser = {

        type: "SUPPLIER",

        id:
          supplier?.id || null,

        name:
          supplier?.full_name ||
          supplier?.company_name ||
          "-",

        email:
          supplier?.email || "-",

        phone:
          supplier?.phone_no || "-",

        profileImage:
          supplier?.profile_image || null,
      };
    }

    // =========================
    // SERVICES
    // =========================

    const services =
      task.TaskServices.map((service) => ({

        serviceId:
          service.id,

        serviceName:
          service.serviceName || "-",

        description:
          service.description ||
          "No description available",

        cost:
          Number(
            service.servicePrice || 0
          ),
      }));

    // =========================
    // PARTS USED
    // =========================

    // Replace later with DB table

    const partsUsed = [

      {
        partName:
          "Marine Fuel Filter",

        quantity: 2,

        cost: 124,
      },

      {
        partName:
          "Synthetic 10W-40",

        quantity: "8L",

        cost: 96,
      },
    ];

    // =========================
    // TOTALS
    // =========================

    const servicesTotal =
      services.reduce(
        (sum, item) =>
          sum + Number(item.cost),
        0
      );

    const partsTotal =
      partsUsed.reduce(
        (sum, item) =>
          sum + Number(item.cost),
        0
      );

    const grandTotal =
      servicesTotal + partsTotal;

    // =========================
    // RESPONSE
    // =========================

    return createSuccessResponse(
      res,
      200,
      true,
      "Job detail fetched successfully",
      {

        // =========================
        // HEADER ACTIONS
        // =========================

        actions: {

          canViewInvoice:
            !!task.invoiceId,

          canSendInvoice:
            taskStatus.number === 4,
        },

        // =========================
        // JOB OVERVIEW
        // =========================

        jobOverview: {

          boatId:
            task.boatId || null,

          boatName:
            task.boat?.name || "-",

          dockLocation:
            task.boat?.dockLocation ||
            "-",

          createdDate:
            new Date(task.createdAt)
              .toLocaleDateString(
                "en-GB"
              ),

          dueDate:
            task.date_scheduled_to
              ? new Date(
                task.date_scheduled_to
              ).toLocaleDateString(
                "en-GB"
              )
              : "-",

          jobId:
            task.jobNumber ||
            `#${task.id}`,

          status:
            taskStatus,
        },

        // =========================
        // ASSIGNED USER
        // =========================

        assignedUser,

        // =========================
        // SERVICES TABLE
        // =========================

        services,

        // =========================
        // PARTS USED
        // =========================

        partsUsed,

        // =========================
        // COST SUMMARY
        // =========================

        costSummary: {

          servicesTotal,

          partsTotal,

          grandTotal,

          taxIncluded: true,
        },

        // =========================
        // INVOICE
        // =========================

        invoice: {

          exists:
            !!task.invoiceId,

          invoiceId:
            task.invoiceId || null,
        },

        // =========================
        // PHOTOS
        // =========================

        photos:
          task.TaskPhoto || [],

        // =========================
        // SERVICE SHEET
        // =========================

        serviceSheet:
          task.JobServiceSheet || null,

        // =========================
        // META
        // =========================

        meta: {

          taskId:
            task.id,

          boatId:
            task.boatId || null,

          invoiceId:
            task.invoiceId || null,

          description:
            task.description,

          quotedValue:
            task.quoted_value,

          createdAt:
            task.createdAt,

          updatedAt:
            task.updatedAt,
        },
      }
    );

  } catch (error) {

    console.log(error);

    return createErrorResponse(
      res,
      500,
      "Internal Server Error"
    );
  }
};
