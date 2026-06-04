import 'dotenv/config';
import { fileURLToPath } from 'url';
import hbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import path from 'path';
import crypto from 'crypto';
import localStorage from 'localStorage'
import { PrismaClient,Prisma  } from '@prisma/client';
import { getDateRanges, randomStringAsBase64Url } from '../utils/helper.js';
import { MessageEnum } from '../config/message.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responseUtil.js';
import { sendEmail } from '../utils/sendMail.js';
import { createNotification, sendNotificationRelateToTask } from '../utils/notification.js';
import {
  getAvailablePartsForTaskUser,
  getExtraPartRequestsForTask
} from './extraPartRequestController.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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


function parseCategoryIds(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return [];

  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      parsed = value.split(",");
    }
  }

  if (!Array.isArray(parsed)) {
    parsed = [parsed];
  }

  return [
    ...new Set(
      parsed
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
}

function formatServiceCategories(links = []) {
  return links
    .map((link) => link.category)
    .filter(Boolean)
    .map((category) => ({
      id: category.id,
      name: category.name,
    }));
}

async function validateServiceCategoryIds(categoryIds) {
  if (categoryIds === undefined || categoryIds.length === 0) {
    return true;
  }

  const count = await prisma.serviceCategory.count({
    where: {
      id: {
        in: categoryIds,
      },
    },
  });

  return count === categoryIds.length;
}

async function replaceSupplierServiceCategories(
  tx,
  supplierId,
  categoryIds
) {
  if (categoryIds === undefined) return;

  await tx.supplierServiceCategory.deleteMany({
    where: {
      supplierId,
    },
  });

  if (categoryIds.length) {
    await tx.supplierServiceCategory.createMany({
      data: categoryIds.map((categoryId) => ({
        supplierId,
        categoryId,
      })),
      skipDuplicates: true,
    });
  }
}


const handlebarOptions = {
  viewEngine: {
    partialsDir: path.resolve(__dirname, "../view/"),
    defaultLayout: false,
  },
  viewPath: path.resolve(__dirname, "../view/"),
};

export async function getAllParts(req, res) {
  try {
    const supplierLinks = await prisma.userSupplier.findMany({
      where: {
        supplierId: req.user.id,
      },
      select: {
        userId: true,
      },
    });

    const userIds = [...new Set(supplierLinks.map((link) => link.userId))];

    const parts = userIds.length
      ? await prisma.partInventory.findMany({
        where: {
          userId: {
            in: userIds,
          },
        },
        select: {
          id: true,
          userId: true,
          name: true,
          original_cost: true,
          boat_owner_cost: true,
          stock_quantity: true,
          low_stock_alert: true,
        },
        orderBy: {
          id: 'desc',
        },
      })
      : [];

    const formatted = parts.map((part, index) => {
      const stockQuantity = Number(part.stock_quantity ?? 0);
      const lowStockAlert = Number(part.low_stock_alert ?? 10);

      return {
        sr_no: index + 1,
        id: part.id,
        user_id: part.userId,
        name: part.name,
        original_cost: Number(part.original_cost ?? 0),
        boat_owner_cost: Number(part.boat_owner_cost ?? 0),
        stock_quantity: stockQuantity,
        low_stock_alert: lowStockAlert,
        low_stock: stockQuantity <= lowStockAlert,
      };
    });

    return createSuccessResponse(
      res,
      200,
      true,
      "Parts fetched successfully",
      formatted
    );
  } catch (error) {
    console.log(error);

    if (error?.name === "PrismaClientInitializationError") {
      return createErrorResponse(
        res,
        503,
        "Database connection unavailable. Please check DATABASE_URL and make sure MySQL is running."
      );
    }

    return createErrorResponse(
      res,
      500,
      MessageEnum.INTERNAL_SERVER_ERROR
    );
  }
}

transporter.use("compile", hbs(handlebarOptions));


const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
// export async function addSupplier(req, res) {
//   try {
//     console.log("here");

//     const { email,company_name, company_description, city, phone_no } = req.body;
//     console.log(req.body);
//     console.log("after");

//     const schema = Joi.object({
//       email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
//       company_name: Joi.string().required(),
//       company_description: Joi.string().required(),
//       city: Joi.string().required(),
//       phone_no: Joi.string().required(),
//     });

//     const result = schema.validate(req.body);
//     if (result.error) {
//       const message = result.error.details.map((i) => i.message).join(",");
//       return res.status(400).json({
//         message: result.error.details[0].message,
//         error: message,
//         missingParams: result.error.details[0].message,
//         status: 400,
//         success: false,
//       });
//     }

//     const supplier = await prisma.supplier.findUnique({
//       where: {
//         email: email,
//       },
//     });
//     if (supplier) {
//       return createErrorResponse(res, 403, MessageEnum.ALREADY_SUPPLIER);
//     }

//     // Save the user with the hashed password using Prisma
//     await prisma.supplier.create({
//       data: {
//         email,
//         company_name,
//         company_description,
//         city,
//         phone_no,
//         userId:req.user.id
//       },
//     });

//     return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_ADDED);

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);

//   }
// }

export async function addSupplier(req, res) {
  try {
    const { email, name, role } = req.body;
    // const categoryIds = parseCategoryIds(req.body.categoryIds ?? req.body.serviceCategoryIds);
    let parsedRole = [];

    if (role) {
      try {
        parsedRole =
          typeof role === "string"
            ? JSON.parse(role)
            : role;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid role format"
        });
      }
    }
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      name: Joi.string().required(),
      role: Joi.any().optional(),
      // categoryIds: Joi.alternatives().try(
      //   Joi.array().items(Joi.number().integer().positive()),
      //   Joi.string().allow("")
      // ).optional(),
      serviceCategoryIds: Joi.alternatives().try(
        Joi.array().items(Joi.number().integer().positive()),
        Joi.string().allow("")
      ).optional(),
    });


    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message, success: false });
    }

    // if (!(await validateServiceCategoryIds(categoryIds))) {
    //   return createErrorResponse(res, 400, "Invalid service category selected");
    // }
    const roleCount =
      await prisma.masterCategory.count({
        where: {
          id: {
            in: parsedRole.map(Number)
          }
        }
      });

    if (roleCount !== parsedRole.length) {
      return createErrorResponse(
        res,
        400,
        "Invalid role selected"
      );
    }
    // Check if supplier already exists
    let supplier = await prisma.supplier.findUnique({ where: { email } });

    const inviteToken = randomStringAsBase64Url(20);

    if (!supplier) {
      // Create new supplier if it doesn't exist
      supplier = await prisma.supplier.create({
        data: {
          email,
          token: inviteToken,
          // role: role || null,
          role: JSON.stringify(parsedRole),
        },
      });
    } else {
      supplier = await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          token: inviteToken,
          // role: role !== undefined ? role : supplier.role,
          role:
            parsedRole.length > 0
              ? JSON.stringify(parsedRole)
              : supplier.role,
        },
      });
    }

    // Check if the user is already linked to this supplier
    const existingLink = await prisma.userSupplier.findUnique({
      where: {
        userId_supplierId: { userId: req.user.id, supplierId: supplier.id },
      },
    });

    if (existingLink) {
      return createErrorResponse(res, 400, MessageEnum.SUPPLIER_ALREADY_LINKED);
    }

    await prisma.$transaction(async (tx) => {
      await tx.userSupplier.create({
        data: {
          userId: req.user.id,
          supplierId: supplier.id,
          name: name
        },
      });

      // await replaceSupplierServiceCategories(tx, supplier.id, categoryIds);
    });

    const mailOptions = {
      from: "noreply@first-mate.net",
      to: email,
      subject: "Your First Mate supplier account invitation",
      template: "supplier_invite",
      context: {
        name,
        email,
        image_logo: `${baseurl}/marine_new_logo.png`,
        create_password_url: `${baseurl}/supplier/verifyPassword/${inviteToken}`,
        login_url: "https://fmservicehub.com/supplier/login",
      },
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (mailError) {
      console.error("supplier invite email error", mailError);
    }
    let roleDetails = [];

    if (parsedRole.length > 0) {

      roleDetails =
        await prisma.masterCategory.findMany({
          where: {
            id: {
              in: parsedRole.map(Number)
            },
            status: 1
          },
          select: {
            id: true,
            name: true,
            isCustom: true
          }
        });

    }
    return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_ADDED);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}


export async function editSupplier(req, res) {
  try {
    console.log("here");

    const { company_name, company_description, city, phone_no, id, role } = req.body;
    let parsedRole = [];

    if (role) {
      try {
        parsedRole =
          typeof role === "string"
            ? JSON.parse(role)
            : role;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid role format"
        });
      }
    }
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      // email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      company_name: Joi.string().optional(),
      company_description: Joi.string().optional(),
      city: Joi.string().optional(),
      phone_no: Joi.string().optional(),
      role: Joi.any().optional(),
      categoryIds: Joi.alternatives().try(
        Joi.array().items(Joi.number().integer().positive()),
        Joi.string().allow("")
      ).optional(),
      serviceCategoryIds: Joi.alternatives().try(
        Joi.array().items(Joi.number().integer().positive()),
        Joi.string().allow("")
      ).optional(),
      id: Joi.number().required()
    });

    const result = schema.validate(req.body);
    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.status(400).json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    }

    const linkedSupplier = await prisma.userSupplier.findUnique({
      where: {
        userId_supplierId: {
          userId: req.user.id,
          supplierId: parseInt(id),
        },
      },
    });

    if (!linkedSupplier) {
      return createErrorResponse(res, 403, MessageEnum.SUPPLIER_NOT_FOUND);
    }

    const supplier = await prisma.supplier.findUnique({
      where: {
        id: parseInt(id)
      },
    });

    if (!supplier) {
      return createErrorResponse(res, 403, MessageEnum.SUPPLIER_NOT_FOUND);
    }

    if (parsedRole.length > 0) {

      const roleCount =
        await prisma.masterCategory.count({
          where: {
            id: {
              in: parsedRole.map(Number)
            },
            status: 1
          }
        });

      if (roleCount !== parsedRole.length) {

        return createErrorResponse(
          res,
          400,
          "Invalid role selected"
        );

      }

    }

    const updatedSupplier =
      await prisma.supplier.update({
        where: {
          id: parseInt(id)
        },
        data: {
          company_name:
            company_name || supplier.company_name,

          company_description:
            company_description || supplier.company_description,

          city:
            city || supplier.city,

          phone_no:
            phone_no || supplier.phone_no,

          role:
            parsedRole.length > 0
              ? JSON.stringify(parsedRole)
              : supplier.role
        }
      });

    let roleIds = [];
    let roleDetails = [];

    if (updatedSupplier.role) {

      try {

        roleIds =
          JSON.parse(updatedSupplier.role);

        roleDetails =
          await prisma.masterCategory.findMany({
            where: {
              id: {
                in: roleIds.map(Number)
              }
            },
            select: {
              id: true,
              name: true,
              isCustom: true,
              status: true,
              createdAt: true,
              updatedAt: true
            }
          });

      } catch (error) {

        roleIds = [];
        roleDetails = [];

      }

    }

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.SUPPLIER_EDITED,
      {
        id: updatedSupplier.id,

        company_name:
          updatedSupplier.company_name,

        // roleIds,

        role: roleDetails,

        city:
          updatedSupplier.city,

        phone_no:
          updatedSupplier.phone_no
      }
    );

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);

  }
}

// export async function getAllSuppliers(req, res) {
//   try {

//     const suppliers = await prisma.supplier.findMany({
//       where: {
//         userId: req.user.id,
//       },
//       orderBy: {
//         createdAt: 'desc'
//       }
//     });

//     return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_DATA, suppliers);

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);

//   }
// }

export async function getAllSuppliers(req, res) {
  try {
    const userId = req.user.id;

    const suppliers = await prisma.userSupplier.findMany({
      where: { userId },
      include: {
        supplier: {
          include: {
            SupplierInsuranceFile: true,
            SupplierServiceCategory: {
              include: {
                category: true,
              },
            },
          }
        },
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const supplierCards = await Promise.all(suppliers.map(async (item) => {
      const supplier = item.supplier;
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          supplierId: supplier.id
        },
        select: {
          status: true
        }
      });

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((task) => task.status === 1).length;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      let roleIds = [];
      let roleDetails = [];

      if (supplier.role) {

        try {

          roleIds = JSON.parse(supplier.role);

          roleDetails =
            await prisma.masterCategory.findMany({
              where: {
                id: {
                  in: roleIds.map(Number)
                }
              },
              select: {
                id: true,
                name: true,
                isCustom: true,
                status: true,
                createdAt: true,
                updatedAt: true
              }
            });

        } catch (error) {

          roleIds = [];
          roleDetails = [];

        }

      }

      return {
        id: supplier.id,
        name: item.name || supplier.company_name || `${supplier.first_name || ''} ${supplier.last_name || ''}`.trim() || supplier.email,
        company_name: supplier.company_name,
        email: supplier.email,
        phone_no: supplier.phone_no,
        role: roleDetails,
        serviceCategoryIds: supplier.SupplierServiceCategory.map((item) => item.categoryId),
        serviceCategories: formatServiceCategories(supplier.SupplierServiceCategory),
        company_logo: supplier.company_logo ? `${baseurl}/profile/${supplier.company_logo}` : null,
        status: supplier.status,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        completion_rate: completionRate
      };
    }));

    return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_DATA, supplierCards);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export async function getSupplierById(req, res) {
  try {
    const supplierId = Number(req.params.id);

    if (!supplierId || isNaN(supplierId)) {
      return res.status(400).json({
        success: false,
        message: "Valid supplier id is required",
      });
    }

    const linkedSupplier = await prisma.userSupplier.findFirst({
      where: {
        userId: req.user.id,
        supplierId,
      },
      include: {
        supplier: {
          include: {
            SupplierInsuranceFile: true,
            SupplierServiceCategory: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!linkedSupplier?.supplier) {
      return createErrorResponse(res, 404, MessageEnum.SUPPLIER_NOT_FOUND);
    }

    const supplier = linkedSupplier.supplier;
    let roleIds = [];
    let roleDetails = [];

    if (supplier.role) {

      try {

        roleIds = JSON.parse(supplier.role);

        roleDetails =
          await prisma.masterCategory.findMany({
            where: {
              id: {
                in: roleIds.map(Number)
              }
            },
            select: {
              id: true,
              name: true,
              isCustom: true,
              status: true,
              createdAt: true,
              updatedAt: true
            }
          });

      } catch (error) {

        roleIds = [];
        roleDetails = [];

      }

    }
    const tasks = await prisma.task.findMany({
      where: {
        userId: req.user.id,
        supplierId: supplier.id,
      },
      select: {
        status: true,
      },
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.status === 1).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const responseData = {
      id: supplier.id,
      name: linkedSupplier.name || supplier.company_name || `${supplier.first_name || ''} ${supplier.last_name || ''}`.trim() || supplier.email,
      first_name: supplier.first_name,
      last_name: supplier.last_name,
      email: supplier.email,
      phone_no: supplier.phone_no,
      role: roleDetails,
      serviceCategoryIds: supplier.SupplierServiceCategory.map((item) => item.categoryId),
      serviceCategories: formatServiceCategories(supplier.SupplierServiceCategory),
      company_name: supplier.company_name,
      company_description: supplier.company_description,
      city: supplier.city,
      abn: supplier.abn,
      about_us: supplier.about_us,
      service_region: supplier.service_region,
      services_offered: supplier.services_offered,
      accounting_software_used: supplier.accounting_software_used,
      complete_profile_status: supplier.complete_profile_status,
      status: supplier.status,
      company_logo: supplier.company_logo ? `${baseurl}/profile/${supplier.company_logo}` : null,
      trade_license: supplier.trade_license ? `${baseurl}/profile/${supplier.trade_license}` : null,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      completion_rate: completionRate,
      insurance_files: supplier.SupplierInsuranceFile.map((file) => ({
        id: file.id,
        filename: file.filename ? `${baseurl}/profile/${file.filename}` : null,
      })),
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };

    return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_DATA, responseData);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}


export async function login(req, res) {
  try {
    const secretKey = process.env.SECRET_KEY;
    const { email, password } = req.body;

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      password: Joi.string().min(8).required().messages({
        "any.required": "{{#label}} is required!!",
        "string.empty": "can't be empty!!",
        "string.min": "minimum 8 value required",
        "string.max": "maximum 15 values allowed",
      }),
      fcm_token: Joi.string().optional(),
    });

    const result = schema.validate({ email, password });
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

    if (email) {
      const suppliers = await prisma.supplier.findUnique({
        where: { email },
      });

      console.log('email', email);

      if (!suppliers) {
        return res.status(400).json({
          success: false,
          message: "Invalid login credentials",
          status: 400,
        });
      }

      if (!suppliers.password) {
        return res.status(400).json({
          success: false,
          message: "Your account does not have a password set. Please reset your password by selecting 'Forgot Password' and creating a new password to continue",
          status: 400,
        });
      }

      if (!suppliers || !(await argon2.verify(suppliers.password, password))) {
        return res.status(400).json({
          success: false,
          message: "Invalid login credentials",
          status: 400,
        });
      }


      if (suppliers.status === 0) {
        return res.status(400).json({
          message: "Your account has been blocked by the administrator. Please contact support for further assistance.",
          status: 400,
          success: false,
        });
      }

      const supplierData = await prisma.supplier.findUnique({
        where: { email },
        include: {
          SupplierServiceCategory: {
            include: {
              category: true,
            },
          },
        },
      });
      supplierData.serviceCategoryIds = supplierData.SupplierServiceCategory.map((item) => item.categoryId);
      supplierData.serviceCategories = formatServiceCategories(supplierData.SupplierServiceCategory);
      delete supplierData.SupplierServiceCategory;

      const token = jwt.sign({ supplierId: supplierData.id }, secretKey, { expiresIn: '24w' });
      return res.json({
        status: 200,
        success: true,
        message: "Login successful!",
        data: {
          token, supplierData
        }
      });
    }
  } catch (error) {
    console.log('error', error);
    if (error?.name === "PrismaClientInitializationError") {
      return res.status(503).json({
        success: false,
        message: "Database connection unavailable. Please check DATABASE_URL and make sure MySQL is running.",
        status: 503,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
    });
  }
}

export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      })
    );
    const result = schema.validate({ email });
    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    } else {
      const admin = await prisma.supplier.findUnique({
        where: {
          email: email,
        }
      })
      if (admin) {
        const genToken = randomStringAsBase64Url(20);
        await prisma.supplier.update({
          where: {
            email: email
          },
          data: {
            token: genToken
          }
        })

        const adminToken = (await prisma.supplier.findUnique({
          where: {
            email: email,
          },
          select: {
            token: true,
          }
        })).token;

        let mailOptions = {
          from: "noreply@first-mate.net",
          to: email,
          subject: "Forgot Password",
          template: "forget_template",
          context: {
            image_logo: `${baseurl}/mainLogo.png`,
            href_url: `${baseurl}/supplier/verifyPassword/${adminToken}`,
            msg: `Please click below link to change password.`,
          },
        };
        transporter.sendMail(mailOptions, async function (error, info) {
          if (error) {
            console.log(error)
            return res.json({
              success: false,
              message: "Mail Not Delivered",
            });
          } else {
            return res.json({
              success: true,
              message:
                "Password reset link sent successfully. Please check your email ",
            });
          }
        });
      } else {
        return res.json({
          success: false,
          message: "Email address not found. Please enter a valid email",
          status: 400,
        });
      }
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
};

export async function getTodayTasks(req, res) {
  try {
    const timeZone = 'Asia/Kolkata';
    const { startOfToday, endOfToday } = getDateRanges(timeZone);

    const taskSupplierEntries = await prisma.taskSupplierOffer.findMany({
      where: {
        supplierId: req.user.id,
        status: { in: ["PENDING", "ACCEPTED"] },
        task: {
          date_scheduled_to: {
            gte: startOfToday.format(),
            lt: endOfToday.format(),
          },
          status: {
            not: 1,
          },
        },
      },
      include: {
        task: {
          include: {
            boat: true,
            supplier: true,
          },
        },
      },
      orderBy: [
        {
          task: {
            date_scheduled_from: 'desc',
          },
        },
        {
          task: {
            id: 'desc',
          },
        },
      ],
    });

    //const tasks = taskSupplierEntries.map((entry) => entry.task);

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, taskSupplierEntries);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}


export async function getTomorrowTask(req, res) {
  try {

    // const  assignStaffId = req.user.id;
    const timeZone = 'Asia/Kolkata';
    const { startOfTomorrow, endOfTomorrow } = getDateRanges(timeZone);
    console.log('startOfTomorrow', startOfTomorrow)

    console.log("startOfTomorrow:", startOfTomorrow.format());
    console.log("endOfTomorrow:", endOfTomorrow.format());


    const taskSupplierEntries = await prisma.taskSupplierOffer.findMany({
      where: {
        supplierId: req.user.id,
        status: { in: ["PENDING", "ACCEPTED"] },
        task: {
          date_scheduled_to: {
            gte: startOfTomorrow.format(),
            lt: endOfTomorrow.format(),
          },
          status: {
            not: 1,
          },
        },
      },
      include: {
        task: {
          include: {
            boat: true,
            supplier: true,
          },
        },
      },
      orderBy: [
        {
          task: {
            date_scheduled_from: 'desc',
          },
        },
        {
          task: {
            id: 'desc',
          },
        },
      ],
    });
    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, taskSupplierEntries);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

export async function getCompletedTasks(req, res) {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        supplierId: req.user.id,
        status: 1
      },
      include: {
        boat: true,
        supplier: true,
      },
      orderBy: [
        { completed_at: 'desc' },
        { id: 'desc' },
      ],
    });

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, tasks);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

// export const createJobServiceSheet = async (req, res) => {
//   const {
//     taskId,
//     date,
//     jobNumber,
//     personAttending,
//     customerName,
//     mobile,
//     workToBeCarriedOut,
//     workCarriedOut,
//     furtherActionRequired,
//     further_action_required,
//     cdsSignature,
//     materials,
//     partsUsed,
//     boatParts,
//     installedDate,
//     warrantyStartDate,
//   } = req.body;

//   const parseArrayField = (value) => {
//     if (!value) return [];
//     if (Array.isArray(value)) return value;

//     if (typeof value === "string") {
//       try {
//         const parsedValue = JSON.parse(value);
//         return Array.isArray(parsedValue) ? parsedValue : [];
//       } catch (parseError) {
//         return [];
//       }
//     }

//     return [];
//   };

//   const calculateWarrantyEndDate = (startDate, duration, type) => {
//     if (!startDate || !duration || !type) return null;

//     const warrantyEndDate = new Date(startDate);

//     switch (String(type).toUpperCase()) {
//       case "DAYS":
//         warrantyEndDate.setDate(
//           warrantyEndDate.getDate() + parseInt(duration, 10)
//         );
//         break;
//       case "MONTHS":
//         warrantyEndDate.setMonth(
//           warrantyEndDate.getMonth() + parseInt(duration, 10)
//         );
//         break;
//       case "YEARS":
//         warrantyEndDate.setFullYear(
//           warrantyEndDate.getFullYear() + parseInt(duration, 10)
//         );
//         break;
//       default:
//         return null;
//     }

//     return warrantyEndDate;
//   };

//   const getWarrantyStatus = (warrantyEndDate) => {
//     if (!warrantyEndDate) return "ACTIVE";

//     const today = new Date();
//     const endDate = new Date(warrantyEndDate);
//     const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

//     if (diffDays < 0) return "EXPIRED";
//     if (diffDays <= 30) return "EXPIRING_SOON";
//     return "ACTIVE";
//   };

//   const normalizedFurtherActionRequired =
//     furtherActionRequired ?? further_action_required;
//   const normalizedMaterialsInput = parseArrayField(materials);
//   const normalizedPartsUsedInput = parseArrayField(partsUsed);
//   const normalizedBoatPartsInput = parseArrayField(boatParts);

//   const schema = Joi.object({
//     taskId: Joi.number().integer().required(),
//     date: Joi.date().required(),
//     jobNumber: Joi.string().optional().allow(""),
//     personAttending: Joi.string().required(),
//     customerName: Joi.string().required(),
//     mobile: Joi.string().optional().allow(""),
//     workToBeCarriedOut: Joi.string().optional().allow(""),
//     workCarriedOut: Joi.string().optional().allow(""),
//     furtherActionRequired: Joi.string().optional().allow(""),
//     further_action_required: Joi.string().optional().allow(""),
//     cdsSignature: Joi.string().optional().allow(""),
//     installedDate: Joi.date().optional(),
//     warrantyStartDate: Joi.date().optional(),
//     materials: Joi.alternatives().try(
//       Joi.array().items(
//         Joi.object({
//           materialName: Joi.string().required(),
//           unitsUsed: Joi.number().required(),
//           pricePerUnit: Joi.number().optional(),
//           totalPrice: Joi.number().optional(),
//         })
//       ),
//       Joi.string()
//     ).optional(),
//     partsUsed: Joi.alternatives().try(
//       Joi.array().items(
//         Joi.object({
//           id: Joi.number().integer().optional(),
//           partId: Joi.number().integer().optional(),
//           materialName: Joi.string().optional(),
//           name: Joi.string().optional(),
//           partName: Joi.string().optional(),
//           unitsUsed: Joi.number().optional(),
//           quantity: Joi.number().optional(),
//           pricePerUnit: Joi.number().optional(),
//           totalPrice: Joi.number().optional(),
//         })
//       ),
//       Joi.string()
//     ).optional(),
//     boatParts: Joi.alternatives().try(
//       Joi.array().items(
//         Joi.object({
//           id: Joi.number().integer().optional(),
//           partId: Joi.number().integer().optional(),
//           installedDate: Joi.date().optional(),
//           warrantyStartDate: Joi.date().optional(),
//           notes: Joi.string().optional().allow(""),
//         })
//       ),
//       Joi.string()
//     ).optional(),
//   });

//   const payloadToValidate = {
//     ...req.body,
//     materials: normalizedMaterialsInput,
//     partsUsed: normalizedPartsUsedInput,
//     boatParts: normalizedBoatPartsInput,
//   };

//   const { error } = schema.validate(payloadToValidate);
//   if (error) {
//     const message = error.details.map((i) => i.message).join(", ");
//     return res.status(400).json({
//       message,
//       missingParams: error.details[0].message,
//       status: 400,
//       success: false,
//     });
//   }

//   try {
//     void normalizedFurtherActionRequired;

//     const task = await prisma.task.findFirst({
//       where: {
//         id: parseInt(taskId),
//         supplierId: req.user.id,
//       },
//       include: {
//         JobServiceSheet: {
//           include: {
//             Material: true,
//           },
//         },
//         user: true,
//       },
//     });

//     if (!task) {
//       return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
//     }

//     const existingExtraPartRequests = await getExtraPartRequestsForTask({
//       taskId: task.id,
//       requesterType: "SUPPLIER",
//       requesterId: req.user.id,
//     });

//     const pendingExtraPartRequests = existingExtraPartRequests.filter(
//       (request) => request.status !== "FULFILLED"
//     );

//     if (pendingExtraPartRequests.length > 0) {
//       return res.status(200).json({
//         success: false,
//         message:
//           "Extra parts request is still pending from user side. Please wait until all requested parts are added before updating the CDS Job Sheet.",
//         status: 200,
//         data: {},
//       });
//     }

//     const fulfilledExtraPartRequests = existingExtraPartRequests.filter(
//       (request) => request.status === "FULFILLED"
//     );
//     const incompleteFulfilledRequests = fulfilledExtraPartRequests.filter(
//       (request) => !request.addedPart
//     );

//     if (incompleteFulfilledRequests.length > 0) {
//       return res.status(200).json({
//         success: false,
//         message:
//           "Requested part is marked fulfilled but was not added to inventory. Please add it from user side before updating the CDS Job Sheet.",
//         status: 200,
//         data: {
//           extraPartRequests: incompleteFulfilledRequests.map((request) => ({
//             id: request.id,
//             partName: request.partName,
//             status: request.status,
//           })),
//         },
//       });
//     }

//     const fulfilledPartsUsed = fulfilledExtraPartRequests.map((request) => {
//       const pricePerUnit =
//         request.attachedMaterial?.pricePerUnit ??
//         request.addedPart.boat_owner_cost ??
//         request.addedPart.original_cost ??
//         0;
//       const unitsUsed = Number(request.unitsUsed || 0);
//       const totalPrice =
//         request.attachedMaterial?.totalPrice ?? unitsUsed * Number(pricePerUnit || 0);

//       return {
//         extraPartRequestId: request.id,
//         partId: request.addedPart.id,
//         materialName: request.addedPart.name || request.partName,
//         name: request.addedPart.name || request.partName,
//         unitsUsed,
//         pricePerUnit: Number(pricePerUnit || 0),
//         totalPrice: Number(totalPrice || 0),
//         source: "REQUEST_FULFILLED",
//       };
//     });

//     const selectedPartIds = normalizedPartsUsedInput
//       .map((part) => parseInt(part.partId ?? part.id, 10))
//       .filter((partId) => !Number.isNaN(partId));

//     const requiredDatePartIds = [
//       ...new Set([
//         ...selectedPartIds,
//         ...fulfilledPartsUsed.map((part) => part.partId),
//       ]),
//     ];
//     const boatPartDateMap = new Map(
//       normalizedBoatPartsInput
//         .map((boatPart) => ({
//           partId: parseInt(boatPart.partId ?? boatPart.id, 10),
//           boatPart,
//         }))
//         .filter(({ partId }) => !Number.isNaN(partId))
//         .map(({ partId, boatPart }) => [partId, boatPart])
//     );
//     const missingDateParts = requiredDatePartIds.filter((partId) => {
//       const boatPart = boatPartDateMap.get(partId);
//       return !(
//         (boatPart?.installedDate || installedDate) &&
//         (boatPart?.warrantyStartDate || warrantyStartDate)
//       );
//     });

//     if (missingDateParts.length > 0) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "installedDate and warrantyStartDate are required for every selected or fulfilled requested part.",
//         status: 400,
//         data: {
//           missingPartIds: missingDateParts,
//         },
//       });
//     }

//     const inventoryParts =
//       selectedPartIds.length > 0
//         ? await prisma.partInventory.findMany({
//             where: {
//               userId: task.userId,
//               id: {
//                 in: selectedPartIds,
//               },
//             },
//             select: {
//               id: true,
//               name: true,
//               original_cost: true,
//               boat_owner_cost: true,
//             },
//           })
//         : [];

//     const inventoryPartMap = new Map(
//       inventoryParts.map((part) => [part.id, part])
//     );

//     const materialRows = [];

//     normalizedMaterialsInput.forEach((material) => {
//       const unitsUsed = parseFloat(material.unitsUsed);
//       const pricePerUnit =
//         material.pricePerUnit !== undefined &&
//         material.pricePerUnit !== null &&
//         material.pricePerUnit !== ""
//           ? parseFloat(material.pricePerUnit)
//           : null;
//       const totalPrice =
//         material.totalPrice !== undefined &&
//         material.totalPrice !== null &&
//         material.totalPrice !== ""
//           ? parseFloat(material.totalPrice)
//           : (pricePerUnit || 0) * unitsUsed;

//       materialRows.push({
//         materialName: material.materialName,
//         unitsUsed,
//         pricePerUnit,
//         totalPrice,
//       });
//     });

//     normalizedPartsUsedInput.forEach((part) => {
//       const partId = parseInt(part.partId ?? part.id, 10);
//       const inventoryPart = inventoryPartMap.get(partId);
//       const materialName =
//         inventoryPart?.name ||
//         part.materialName ||
//         part.name ||
//         part.partName;
//       const unitsUsed = parseFloat(part.unitsUsed ?? part.quantity ?? 0);

//       if (!materialName || Number.isNaN(unitsUsed) || unitsUsed <= 0) {
//         return;
//       }

//       const pricePerUnit =
//         part.pricePerUnit !== undefined &&
//         part.pricePerUnit !== null &&
//         part.pricePerUnit !== ""
//           ? parseFloat(part.pricePerUnit)
//           : inventoryPart?.boat_owner_cost ?? inventoryPart?.original_cost ?? 0;
//       const totalPrice =
//         part.totalPrice !== undefined &&
//         part.totalPrice !== null &&
//         part.totalPrice !== ""
//           ? parseFloat(part.totalPrice)
//           : unitsUsed * pricePerUnit;

//       materialRows.push({
//         materialName,
//         unitsUsed,
//         pricePerUnit,
//         totalPrice,
//       });
//     });

//     fulfilledPartsUsed.forEach((part) => {
//       if (selectedPartIds.includes(part.partId)) return;

//       materialRows.push({
//         materialName: part.materialName,
//         unitsUsed: part.unitsUsed,
//         pricePerUnit: part.pricePerUnit,
//         totalPrice: part.totalPrice,
//       });
//     });

//     const jobSheetPayload = {
//       date: new Date(date),
//       taskId: parseInt(taskId),
//       boatId: task.boatId,
//       userId: task.userId,
//       supplierId: req.user.id,
//       jobNumber,
//       personAttending,
//       customerName,
//       mobile,
//       workToBeCarriedOut,
//       workCarriedOut,
//       cdsSignature,
//     };

//     let jobServiceSheet = task.JobServiceSheet[0] || null;

//     if (jobServiceSheet) {
//       jobServiceSheet = await prisma.jobServiceSheet.update({
//         where: {
//           id: jobServiceSheet.id,
//         },
//         data: jobSheetPayload,
//       });

//       await prisma.material.deleteMany({
//         where: {
//           jobServiceSheetId: jobServiceSheet.id,
//         },
//       });
//     } else {
//       jobServiceSheet = await prisma.jobServiceSheet.create({
//         data: jobSheetPayload,
//       });
//     }

//     if (materialRows.length > 0) {
//       await prisma.material.createMany({
//         data: materialRows.map((material) => ({
//           jobServiceSheetId: jobServiceSheet.id,
//           materialName: material.materialName,
//           unitsUsed: material.unitsUsed,
//           pricePerUnit: material.pricePerUnit,
//           totalPrice: material.totalPrice,
//         })),
//       });
//     }

//     const installedBoatParts = [];

//     for (const boatPart of normalizedBoatPartsInput) {
//       const partId = parseInt(boatPart.partId ?? boatPart.id, 10);

//       if (Number.isNaN(partId)) {
//         continue;
//       }

//       const part = await prisma.partInventory.findFirst({
//         where: {
//           id: partId,
//           userId: task.userId,
//         },
//       });

//       if (!part) {
//         continue;
//       }

//       const installedDateValue = boatPart.installedDate || installedDate || null;
//       const warrantyStartDateValue =
//         boatPart.warrantyStartDate ||
//         warrantyStartDate ||
//         installedDateValue ||
//         null;

//       const warrantyEndDate = calculateWarrantyEndDate(
//         warrantyStartDateValue,
//         part.warranty_duration,
//         part.warranty_type
//       );

//       const status = getWarrantyStatus(warrantyEndDate);

//       await prisma.$executeRaw`
//         INSERT INTO BoatPart
//           (boatId, partId, installedDate, warrantyStartDate, warrantyEndDate, status, notes, createdAt, updatedAt)
//         VALUES
//           (
//             ${task.boatId},
//             ${partId},
//             ${installedDateValue ? new Date(installedDateValue) : null},
//             ${warrantyStartDateValue ? new Date(warrantyStartDateValue) : null},
//             ${warrantyEndDate},
//             ${status},
//             ${boatPart.notes || null},
//             NOW(),
//             NOW()
//           )
//       `;

//       installedBoatParts.push({
//         partId,
//         boatId: task.boatId,
//         installedDate: installedDateValue,
//         warrantyStartDate: warrantyStartDateValue,
//         warrantyEndDate,
//         status,
//         notes: boatPart.notes || null,
//       });
//     }

//     await prisma.task.update({
//       where: {
//         id: parseInt(taskId),
//       },
//       data: {
//         status: 2,
//       },
//     });

//     const responseData = {
//       ...jobServiceSheet,
//       materials: materialRows,
//       partsUsed: [
//         ...normalizedPartsUsedInput,
//         ...fulfilledPartsUsed.filter((part) => !selectedPartIds.includes(part.partId)),
//       ],
//       boatParts: installedBoatParts,
//     };

//     return createSuccessResponse(
//       res,
//       200,
//       true,
//       MessageEnum.JOB_SERVICE_SHEET,
//       responseData
//     );
//   } catch (error) {
//     console.error(error);
//     return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
//   }
// };

export const createJobServiceSheet = async (req, res) => {
  const {
    taskId,
    date,
    jobNumber,
    personAttending,
    customerName,
    mobile,
    workToBeCarriedOut,
    workCarriedOut,
    furtherActionRequired,
    further_action_required,
    cdsSignature,
    materials,
    boatParts,
  } = req.body;

  const parseArrayField = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const calculateWarrantyEndDate = (startDate, duration, type) => {
    if (!startDate || !duration || !type) return null;
    const end = new Date(startDate);
    switch (String(type).toUpperCase()) {
      case "DAYS":
        end.setDate(end.getDate() + parseInt(duration, 10));
        break;
      case "MONTHS":
        end.setMonth(end.getMonth() + parseInt(duration, 10));
        break;
      case "YEARS":
        end.setFullYear(end.getFullYear() + parseInt(duration, 10));
        break;
      default:
        return null;
    }
    return end;
  };

  const getWarrantyStatus = (warrantyEndDate) => {
    if (!warrantyEndDate) return "ACTIVE";
    const diffDays = Math.ceil((new Date(warrantyEndDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "EXPIRED";
    if (diffDays <= 30) return "EXPIRING_SOON";
    return "ACTIVE";
  };

  const normalizedMaterialsInput = parseArrayField(materials);
  const normalizedBoatPartsInput = parseArrayField(boatParts);

  // ── Validation ──────────────────────────────────────────────────────────────
  const schema = Joi.object({
    taskId: Joi.number().integer().required(),
    date: Joi.date().required(),
    jobNumber: Joi.string().optional().allow(""),
    personAttending: Joi.string().required(),
    customerName: Joi.string().required(),
    mobile: Joi.string().optional().allow(""),
    workToBeCarriedOut: Joi.string().optional().allow(""),
    workCarriedOut: Joi.string().optional().allow(""),
    furtherActionRequired: Joi.string().optional().allow(""),
    further_action_required: Joi.string().optional().allow(""),
    cdsSignature: Joi.string().optional().allow(""),
    materials: Joi.alternatives().try(
      Joi.array().items(Joi.object({
        materialName: Joi.string().required(),
        unitsUsed: Joi.number().required(),
        pricePerUnit: Joi.number().optional(),
        totalPrice: Joi.number().optional(),
      })),
      Joi.string()
    ).optional(),
    boatParts: Joi.alternatives().try(
      Joi.array().items(Joi.object({
        partId: Joi.number().integer().required(),
        installedDate: Joi.date().required(),
        warrantyStartDate: Joi.date().required(),
        notes: Joi.string().optional().allow(""),
      })),
      Joi.string()
    ).optional(),
  });

  const { error } = schema.validate(
    { ...req.body, materials: normalizedMaterialsInput, boatParts: normalizedBoatPartsInput },
    { allowUnknown: true }
  );
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      missingParams: error.details[0].message,
      status: 400,
    });
  }

  try {
    void furtherActionRequired;
    void further_action_required;

    // ── Fetch task ────────────────────────────────────────────────────────────
    const task = await prisma.task.findFirst({
      where: { id: parseInt(taskId), supplierId: req.user.id },
      include: {
        JobServiceSheet: { include: { Material: true } },
        user: true,
      },
    });

    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
    }

    // ── Validate boatParts exist in PartInventory ─────────────────────────────
    if (normalizedBoatPartsInput.length > 0) {
      const partIds = normalizedBoatPartsInput.map((bp) => parseInt(bp.partId, 10));

      const foundParts = await prisma.$queryRaw`
        SELECT id FROM \`PartInventory\`
        WHERE id IN (${Prisma.join(partIds)}) AND userId = ${task.userId}
      `;

      const foundIds = foundParts.map((p) => Number(p.id));
      const missingIds = partIds.filter((id) => !foundIds.includes(id));

      if (missingIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Parts not found in inventory: ${missingIds.join(", ")}`,
          status: 400,
          data: { missingPartIds: missingIds },
        });
      }
    }

    // ── Build material rows ───────────────────────────────────────────────────
    const materialRows = normalizedMaterialsInput.map((material) => {
      const unitsUsed = parseFloat(material.unitsUsed);
      const pricePerUnit = material.pricePerUnit != null && material.pricePerUnit !== ""
        ? parseFloat(material.pricePerUnit)
        : null;
      const totalPrice = material.totalPrice != null && material.totalPrice !== ""
        ? parseFloat(material.totalPrice)
        : (pricePerUnit || 0) * unitsUsed;

      return { materialName: material.materialName, unitsUsed, pricePerUnit, totalPrice };
    });

    // ── Create / update job service sheet ────────────────────────────────────
    const jobSheetPayload = {
      date: new Date(date),
      taskId: parseInt(taskId),
      boatId: task.boatId,
      userId: task.userId,
      supplierId: req.user.id,
      jobNumber: jobNumber || null,
      personAttending: personAttending || null,
      customerName: customerName || null,
      mobile: mobile || null,
      workToBeCarriedOut: workToBeCarriedOut || null,
      workCarriedOut: workCarriedOut || null,
      cdsSignature: cdsSignature || null,
    };

    let jobServiceSheet = task.JobServiceSheet[0] || null;

    if (jobServiceSheet) {
      jobServiceSheet = await prisma.jobServiceSheet.update({
        where: { id: jobServiceSheet.id },
        data: jobSheetPayload,
      });
      await prisma.material.deleteMany({
        where: { jobServiceSheetId: jobServiceSheet.id },
      });
    } else {
      jobServiceSheet = await prisma.jobServiceSheet.create({
        data: jobSheetPayload,
      });
    }

    // ── Save materials ────────────────────────────────────────────────────────
    if (materialRows.length > 0) {
      await prisma.material.createMany({
        data: materialRows.map((m) => ({
          jobServiceSheetId: jobServiceSheet.id,
          materialName: m.materialName,
          unitsUsed: m.unitsUsed,
          pricePerUnit: m.pricePerUnit,
          totalPrice: m.totalPrice,
        })),
      });
    }

    // ── Save boatParts with warranty ──────────────────────────────────────────
    const installedBoatParts = [];

    for (const bp of normalizedBoatPartsInput) {
      const partId = parseInt(bp.partId, 10);

      // ✅ Use $queryRaw to bypass Prisma's type conversion error on warranty_type field
      const partRows = await prisma.$queryRaw`
        SELECT id, warranty_duration, warranty_type
        FROM \`PartInventory\`
        WHERE id = ${partId} AND userId = ${task.userId}
        LIMIT 1
      `;

      const part = partRows[0];
      if (!part) continue; // already validated above, safety net

      const installedDateValue = new Date(bp.installedDate);
      const warrantyStartDateValue = new Date(bp.warrantyStartDate);

      const warrantyType = part.warranty_type ? String(part.warranty_type) : null;
      const warrantyDuration = part.warranty_duration ? Number(part.warranty_duration) : null;

      const warrantyEndDate = calculateWarrantyEndDate(
        warrantyStartDateValue,
        warrantyDuration,
        warrantyType
      );

      const status = getWarrantyStatus(warrantyEndDate);

      const created = await prisma.boatPart.create({
        data: {
          boatId: task.boatId,
          partId,
          installedDate: installedDateValue,
          warrantyStartDate: warrantyStartDateValue,
          warrantyEndDate: warrantyEndDate ?? null,
          status,
          notes: bp.notes || null,
        },
      });

      installedBoatParts.push({
        id: created.id,
        partId,
        boatId: task.boatId,
        installedDate: installedDateValue,
        warrantyStartDate: warrantyStartDateValue,
        warrantyEndDate: warrantyEndDate ?? null,
        status,
        notes: bp.notes || null,
      });
    }

    // ── Update task status ────────────────────────────────────────────────────
    await prisma.task.update({
      where: { id: parseInt(taskId) },
      data: { status: 2 },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.JOB_SERVICE_SHEET, {
      ...jobServiceSheet,
      materials: materialRows,
      boatParts: installedBoatParts,
    });

  } catch (error) {
    console.error("JobServiceSheet Supplier Error:", error?.message, error?.stack);
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error",
      status: 500,
      data: {},
    });
  }
};

export const completeTask = async (req, res) => {
  try {
    const {
      taskId,
      taskInfo,
      supplierNotes,
      futureWatchList,
      recommendedDueDate,
    } = req.body;

    const schema = Joi.object({
      taskId: Joi.number().required(),
      taskInfo: Joi.string().optional(),
      supplierNotes: Joi.string().optional(),
      futureWatchList: Joi.string().optional(),
      recommendedDueDate: Joi.date().optional(),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      const message = error.details.map((i) => i.message).join(", ");
      return res.status(400).json({
        message,
        missingParams: error.details[0].message,
        status: 400,
        success: false,
      });
    }

    const task = await prisma.task.findUnique({
      where: {
        id: parseInt(taskId),
        supplierId: req.user.id
      },
    });

    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);

    }
    if (req.files && req.files.length > 0) {
      const images = req.files.map((file) => ({
        url: file.filename,
        taskId: parseInt(taskId),
        supplierId: req.user.id
      }));


      const { startOfToday } = getDateRanges();
      await prisma.task.update({
        where: { id: parseInt(taskId) },
        data: {
          taskInfo,
          supplierNotes,
          futureWatchList,
          recommendedDueDate: new Date(recommendedDueDate),
          status: 1,
          completed_at: startOfToday.toDate()
        },
      });

      await prisma.taskPhoto.createMany({
        data: images,
      });
      const user = await prisma.user.findUnique({
        where: {
          id: task.userId
        }
      })
      // await createNotification({
      //   toUserId: user.id,
      //   byStaffId: req.user.id,
      //   taskId: task.id,
      //   data: {},
      //   type: 'task',
      //   content: `${req.user.full_name} completed a Task`
      // })

      // await sendNotificationRelateToTask({
      //   token: user.fcm_token,
      //   toUserId: user.id,
      //   body: `${req.user.full_name} completed a Task`,
      //   taskId: task.id
      // })

      return createSuccessResponse(
        res,
        200,
        true,
        MessageEnum.TASK_COMPLETED,
      );

    } else {
      return createErrorResponse(res, 400, MessageEnum.UPLOAD_IMAGES);
    }
  } catch (error) {
    console.log("eror", error)
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }

};

export async function verifyPassword(req, res) {
  try {

    const id = req.params.token;
    console.log('id', id)

    console.log(id)

    if (!id) {
      return res.status(400).send("Invalid link");
    }
    else {
      const supplier = await prisma.supplier.findFirst({
        where: {
          token: id
        }
      })
      const token = supplier.token;
      if (token) {
        console.log("here is the vertoken");
        localStorage.setItem('vertoken', JSON.stringify(token));
        res.render(path.join(__dirname, '../view/', 'forgetPasswordSupplier.ejs'), { msg: "" });
      }
      else {
        res.render(path.join(__dirname, '../view/', 'forgetPasswordSupplier.ejs'), { msg: "This User is not Registered" });

      }
    }
  }
  catch (err) {
    console.log(err);
    res.send(`<div class="container">
        <p>404 Error, Page Not Found</p>
        </div> `);
  }
};

export async function changePassword(req, res) {
  try {
    const { password, confirm_password } = req.body;
    const token = JSON.parse(localStorage.getItem('vertoken'));
    const schema = Joi.alternatives(
      Joi.object({
        password: Joi.string().min(8).required().messages({
          "any.required": "{{#label}} is required!!",
          "string.empty": "can't be empty!!",
          "string.min": "minimum 8 value required",
          "string.max": "maximum 10 values allowed",
        }),
        confirm_password: Joi.string().min(8).required().messages({
          "any.required": "{{#label}} is required!!",
          "string.empty": "can't be empty!!",
          "string.min": "minimum 8 value required",
          "string.max": "maximum 10 values allowed",
        }),
      })
    )
    const result = schema.validate({ password, confirm_password });
    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      res.render(path.join(__dirname, '../view/', 'forgetPasswordSupplier.ejs'), {
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        msg: message
      });

    }
    else {
      if (password == confirm_password) {
        const suppliers = await prisma.supplier.findFirst({
          where: {
            token: token
          }
        });
        if (suppliers) {
          const hashedPassword = await argon2.hash(password);
          await prisma.supplier.update({
            where: {
              id: suppliers.id
            },
            data: {
              password: hashedPassword
            }
          })
          // console.log("result2",result2)
          res.sendFile(path.join(__dirname, '../view/message.html'), { msg: "" });
          // else {
          //   res.render(path.join(__dirname ,'../view/', 'forgetPassword.ejs'), { msg: "Internal Error Occured, Please contact Support." });
          // }
        }
        else {
          return res.json({
            message: "User not found please register your account",
            success: false,
            status: 400,
          })
        }
      }
      else {
        res.render(path.join(__dirname, '../view/', 'forgetPassword.ejs'),
          { msg: "Password and Confirm Password do not match" });
      }
    }
  }
  catch (error) {
    console.log(error);

    res.render(path.join(__dirname, '/view/', 'forgetPassword.ejs'),
      { msg: "Internal server error" })
  }
};

export async function changePasswordApi(req, res) {
  try {
    const { current_password, password, confirm_password } = req.body;

    const schema = Joi.object({
      current_password: Joi.string().min(8).required().messages({
        "any.required": "Current password is required",
        "string.empty": "Current password cannot be empty",
        "string.min": "Current password must be at least 8 characters",
      }),
      password: Joi.string().min(8).required().messages({
        "any.required": "New password is required",
        "string.empty": "New password cannot be empty",
        "string.min": "New password must be at least 8 characters",
      }),
      confirm_password: Joi.string().min(8).required().messages({
        "any.required": "Confirm password is required",
        "string.empty": "Confirm password cannot be empty",
        "string.min": "Confirm password must be at least 8 characters",
      }),
    });

    const { error } = schema.validate({ current_password, password, confirm_password });

    if (error) {
      return createErrorResponse(res, 400, error.details[0].message);
    }

    if (password !== confirm_password) {
      return createErrorResponse(res, 400, "Password and confirm password do not match");
    }

    const supplier = await prisma.supplier.findUnique({
      where: {
        id: req.user.id
      }
    });

    if (!supplier) {
      return createErrorResponse(res, 404, MessageEnum.SUPPLIER_NOT_FOUND);
    }

    if (!supplier.password) {
      return createErrorResponse(res, 400, "No password is set for this account. Please use forgot password.");
    }

    const isCurrentPasswordValid = await argon2.verify(supplier.password, current_password);

    if (!isCurrentPasswordValid) {
      return createErrorResponse(res, 401, "Current password is incorrect");
    }

    const hashedPassword = await argon2.hash(password);

    await prisma.supplier.update({
      where: {
        id: supplier.id
      },
      data: {
        password: hashedPassword
      }
    });

    return createSuccessResponse(res, 200, true, "Supplier password changed successfully");
  } catch (error) {
    console.log("changePasswordApi error => ", error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

export async function getMyProfile(req, res) {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: {
        id: req.user.id
      },
      include: {
        SupplierInsuranceFile: true,
        SupplierServiceCategory: {
          include: {
            category: true,
          },
        },
      }
    })

    let roleIds = [];
    let roleDetails = [];

    if (supplier.role) {

      try {

        roleIds = JSON.parse(supplier.role);

        roleDetails =
          await prisma.masterCategory.findMany({
            where: {
              id: {
                in: roleIds.map(Number)
              }
            },
            select: {
              id: true,
              name: true,
              isCustom: true,
              status: true,
              createdAt: true,
              updatedAt: true
            }
          });

      } catch (error) {

        roleIds = [];
        roleDetails = [];

      }

    }
    // supplier.serviceCategoryIds = supplier.SupplierServiceCategory.map((item) => item.categoryId);
    // supplier.serviceCategories = formatServiceCategories(supplier.SupplierServiceCategory);
    delete supplier.SupplierServiceCategory;
    // supplier.roleIds = roleIds;

    supplier.role = roleDetails;
    if (supplier.company_logo) {
      supplier.company_logo = `${baseurl}/profile/${supplier.company_logo}`
    }
    if (supplier.trade_license) {
      supplier.trade_license = `${baseurl}/profile/${supplier.trade_license}`
    }

    if (supplier.SupplierInsuranceFile.length > 0) {

      await Promise.all(supplier.SupplierInsuranceFile.map((file) => {
        file.filename = `${baseurl}/profile/${file.filename}`
      }))

    }

    createSuccessResponse(res, 200, true, MessageEnum.PROFILE_DATA, supplier);


  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);


  }
}

export async function completeProfile(req, res) {
  try {
    const {
      company_name,
      first_name, last_name,
      accounting_software_used,
      about_us,
      phone_no,
      service_region,
      services_offered,
      abn,
      role
    } = req.body;
    const categoryIds = parseCategoryIds(req.body.categoryIds ?? req.body.serviceCategoryIds);
    let parsedRole = [];

    if (role) {

      try {

        parsedRole =
          typeof role === "string"
            ? JSON.parse(role)
            : role;

      } catch (error) {

        return createErrorResponse(
          res,
          400,
          "Invalid role format"
        );

      }

    }
    const schema = Joi.object({
      company_name: Joi.string().optional(),
      accounting_software_used: Joi.string().optional().allow(''),
      about_us: Joi.string().optional().allow(''),
      service_region: Joi.string().optional().allow(''),
      phone_no: Joi.string().optional(),
      services_offered: Joi.string().optional().allow(''),
      abn: Joi.string().optional().allow(''),
      first_name: Joi.string().max(255).required(),
      last_name: Joi.string().max(255).required(),
      role: Joi.any().optional(),
      // categoryIds: Joi.alternatives().try(
      //   Joi.array().items(Joi.number().integer().positive()),
      //   Joi.string().allow("")
      // ).optional(),
      // serviceCategoryIds: Joi.alternatives().try(
      //   Joi.array().items(Joi.number().integer().positive()),
      //   Joi.string().allow("")
      // ).optional(),
    });

    const result = schema.validate(req.body);
    if (result.error) {
      const message = result.error.details.map(i => i.message).join(",");
      return res.status(400).json({
        message: result.error.details[0].message,
        error: message,
        success: false
      });
    }

    if (!(await validateServiceCategoryIds(categoryIds))) {
      return createErrorResponse(res, 400, "Invalid service category selected");
    }

    if (parsedRole.length > 0) {

      const roleCount =
        await prisma.masterCategory.count({
          where: {
            id: {
              in: parsedRole.map(Number)
            },
            status: 1
          }
        });

      if (roleCount !== parsedRole.length) {

        return createErrorResponse(
          res,
          400,
          "Invalid role selected"
        );

      }

    }

    let company_logo = null;
    let trade_license = null;
    if (req.files && req.files['logo'] && req.files['logo'][0]) {
      company_logo = req.files['logo'][0].filename;
    }


    if (req.files && req.files['trade_license'] && req.files['trade_license'][0]) {
      trade_license = req.files['trade_license'][0].filename;
    }


    const supplierData = {
      company_name: company_name || req.user.company_name,
      first_name: first_name ? first_name : req.user.first_name,
      last_name: last_name ? last_name : req.user.last_name,
      company_logo: company_logo || req.user.company_logo,
      trade_license: trade_license || req.user.trade_license,
      accounting_software_used: accounting_software_used !== null && accounting_software_used !== undefined ? accounting_software_used : req.user.accounting_software_used,
      about_us: about_us !== null && about_us !== undefined ? about_us : req.user.about_us,
      service_region: service_region !== null && service_region !== undefined ? service_region : req.user.service_region,
      phone_no: phone_no || req.user.phone_no,
      services_offered: services_offered !== null && services_offered !== undefined ? services_offered : req.user.services_offered,
      abn: abn !== null && abn !== undefined ? abn : req.user.abn,
      // role: role !== null && role !== undefined ? role : req.user.role,
      role:
        parsedRole.length > 0
          ? JSON.stringify(parsedRole)
          : req.user.role,
      complete_profile_status: 1
    };

    await prisma.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id: req.user.id },
        data: supplierData,
      });

      await replaceSupplierServiceCategories(tx, req.user.id, categoryIds);
    });

    if (req.files && req.files['insurance']) {
      for (const file of req.files['insurance']) {
        await prisma.supplierInsuranceFile.create({
          data: {
            filename: file.filename,
            supplierId: req.user.id,
          }
        });
      }
    }

    const updatedSupplier = await prisma.supplier.findUnique({
      where: { id: req.user.id },
      include: {
        SupplierServiceCategory: {
          include: {
            category: true,
          },
        },
      },
    });

    let roleIds = [];
    let roleDetails = [];

    if (updatedSupplier.role) {

      try {

        roleIds =
          JSON.parse(updatedSupplier.role);

        roleDetails =
          await prisma.masterCategory.findMany({
            where: {
              id: {
                in: roleIds.map(Number)
              }
            },
            select: {
              id: true,
              name: true,
              isCustom: true,
              status: true,
              createdAt: true,
              updatedAt: true
            }
          });

      } catch (error) {

        roleIds = [];
        roleDetails = [];

      }

    }

    updatedSupplier.serviceCategoryIds = updatedSupplier.SupplierServiceCategory.map((item) => item.categoryId);
    updatedSupplier.serviceCategories = formatServiceCategories(updatedSupplier.SupplierServiceCategory);
    delete updatedSupplier.SupplierServiceCategory;
    updatedSupplier.roleIds = roleIds;
    updatedSupplier.role = roleDetails;

    let mailOptions = {
      from: "noreply@first-mate.net",
      to: 'ahoy@firstmate.com.au',
      subject: `Supplier Profile Completed`,
      template: "supplier_email",
      context: {
        email: updatedSupplier.email,
        phone_no: updatedSupplier.phone_no,
        company_name: updatedSupplier.company_name,
      },
    };
    await sendEmail(mailOptions);

    return createSuccessResponse(res, 200, true, MessageEnum.PROFILE_COMPLETED, updatedSupplier);

  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

// export async function editProfile(req, res) {
//   try {
//     const {
//       company_name,
//       first_name, last_name,
//       accounting_software_used,
//       about_us,
//       phone_no,
//       service_region,
//       services_offered,
//       abn,
//       role
//     } = req.body;
//     const schema = Joi.object({
//       company_name: Joi.string().optional(),
//       accounting_software_used: Joi.string().optional().allow(''),
//       about_us: Joi.string().optional().allow(''),
//       service_region: Joi.string().optional().allow(''),
//       phone_no: Joi.string().optional(),
//       services_offered: Joi.string().optional().allow(''),
//       abn: Joi.string().optional().allow(''),
//       first_name: Joi.string().max(255).required(),
//       last_name: Joi.string().max(255).required(),
//       role: Joi.string().optional().allow(''),
//     });

//     const result = schema.validate(req.body);
//     if (result.error) {
//       const message = result.error.details.map(i => i.message).join(",");
//       return res.status(400).json({
//         message: result.error.details[0].message,
//         error: message,
//         success: false
//       });
//     }

//     let company_logo = null;
//     let trade_license = null;
//     if (req.files && req.files['logo'] && req.files['logo'][0]) {
//       company_logo = req.files['logo'][0].filename;
//     }


//     if (req.files && req.files['trade_license'] && req.files['trade_license'][0]) {
//       trade_license = req.files['trade_license'][0].filename;
//     }


//     const supplierData = {
//       company_name: company_name || req.user.company_name,
//       first_name: first_name ? first_name : req.user.first_name,
//       last_name: last_name ? last_name : req.user.last_name,
//       company_logo: company_logo || req.user.company_logo,
//       trade_license: trade_license || req.user.trade_license,
//       accounting_software_used: accounting_software_used !== null && accounting_software_used !== undefined ? accounting_software_used : req.user.accounting_software_used,
//       about_us: about_us !== null && about_us !== undefined ? about_us : req.user.about_us,
//       service_region: service_region !== null && service_region !== undefined ? service_region : req.user.service_region,
//       phone_no: phone_no || req.user.phone_no,
//       services_offered: services_offered !== null && services_offered !== undefined ? services_offered : req.user.services_offered,
//       abn: abn !== null && abn !== undefined ? abn : req.user.abn,
//       role: role !== null && role !== undefined ? role : req.user.role,
//     };

//     await prisma.supplier.update({
//       where: { id: req.user.id },
//       data: supplierData,
//     });

//     if (req.files && req.files['insurance']) {
//       for (const file of req.files['insurance']) {
//         await prisma.supplierInsuranceFile.create({
//           data: {
//             filename: file.filename,
//             supplierId: req.user.id,
//           }
//         });
//       }
//     }

//     const updatedSupplier = await prisma.supplier.findUnique({
//       where: { id: req.user.id },
//     });

//     return createSuccessResponse(res, 200, true, MessageEnum.PROFILE_UPDATED, updatedSupplier);

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error.",
//       error: error.message
//     });
//   }
// }
export async function editProfile(req, res) {
  try {
    const {
      company_name,
      first_name, last_name,
      accounting_software_used,
      about_us,
      phone_no,
      service_region,
      services_offered,
      abn,
      role
    } = req.body;
    // const categoryIds = parseCategoryIds(req.body.categoryIds ?? req.body.serviceCategoryIds);
    let parsedRole = role;

    if (typeof role === "string") {
      try {
        parsedRole = JSON.parse(role);
      } catch (err) {
        parsedRole = [];
      }
    }

    const schema = Joi.object({
      company_name: Joi.string().optional(),
      accounting_software_used: Joi.string().optional().allow(''),
      about_us: Joi.string().optional().allow(''),
      service_region: Joi.string().optional().allow(''),
      phone_no: Joi.string().optional(),
      services_offered: Joi.string().optional().allow(''),
      abn: Joi.string().optional().allow(''),
      first_name: Joi.string().max(255).required(),
      last_name: Joi.string().max(255).required(),
      role: Joi.array()
        .items(Joi.number().integer().positive())
        .optional()
    });

    const result = schema.validate({
      ...req.body,
      role: parsedRole
    });
    if (result.error) {
      const message = result.error.details.map(i => i.message).join(",");
      return res.status(400).json({
        message: result.error.details[0].message,
        error: message,
        success: false
      });
    }

    // if (!(await validateServiceCategoryIds(categoryIds))) {
    //   return createErrorResponse(res, 400, "Invalid service category selected");
    // }

    let company_logo = null;
    let trade_license = null;
    if (req.files && req.files['logo'] && req.files['logo'][0]) {
      company_logo = req.files['logo'][0].filename;
    }


    if (req.files && req.files['trade_license'] && req.files['trade_license'][0]) {
      trade_license = req.files['trade_license'][0].filename;
    }


    const supplierData = {
      company_name: company_name || req.user.company_name,
      first_name: first_name ? first_name : req.user.first_name,
      last_name: last_name ? last_name : req.user.last_name,
      company_logo: company_logo || req.user.company_logo,
      trade_license: trade_license || req.user.trade_license,
      accounting_software_used: accounting_software_used !== null && accounting_software_used !== undefined ? accounting_software_used : req.user.accounting_software_used,
      about_us: about_us !== null && about_us !== undefined ? about_us : req.user.about_us,
      service_region: service_region !== null && service_region !== undefined ? service_region : req.user.service_region,
      phone_no: phone_no || req.user.phone_no,
      services_offered: services_offered !== null && services_offered !== undefined ? services_offered : req.user.services_offered,
      abn: abn !== null && abn !== undefined ? abn : req.user.abn,
      role: role ? JSON.stringify(parsedRole) : req.user.role
    };

    await prisma.supplier.update({
      where: {
        id: req.user.id
      },
      data: supplierData
    });

    if (req.files && req.files['insurance']) {
      for (const file of req.files['insurance']) {
        await prisma.supplierInsuranceFile.create({
          data: {
            filename: file.filename,
            supplierId: req.user.id,
          }
        });
      }
    }

    // const updatedSupplier = await prisma.supplier.findUnique({
    //   where: { id: req.user.id },
    //   include: {
    //     SupplierServiceCategory: {
    //       include: {
    //         category: true,
    //       },
    //     },
    //   },
    // });

    const updatedSupplier = await prisma.supplier.findUnique({
      where: {
        id: req.user.id
      }
    });

const roleIds = updatedSupplier.role
  ? JSON.parse(updatedSupplier.role)
  : [];

const roles = roleIds.length
  ? await prisma.masterCategory.findMany({
      where: {
        id: {
          in: roleIds
        }
      },
      select: {
        id: true,
        name: true,
        isCustom: true,
        status: true
      }
    })
  : [];

updatedSupplier.role = roles;
    // updatedSupplier.serviceCategoryIds = updatedSupplier.SupplierServiceCategory.map((item) => item.categoryId);
    // updatedSupplier.serviceCategories = formatServiceCategories(updatedSupplier.SupplierServiceCategory);
    // delete updatedSupplier.SupplierServiceCategory;

    return createSuccessResponse(res, 200, true, MessageEnum.PROFILE_UPDATED, updatedSupplier);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
}

export async function getAllMytasks(req, res) {
  try {

    const taskSupplierEntries = await prisma.taskSupplierOffer.findMany({
      where: {
        supplierId: req.user.id,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      include: {
        task: {
          include: {
            boat: true,
            supplier: true,
            TaskServices: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          task: {
            date_scheduled_from: 'desc',
          },
        },
        {
          task: {
            id: 'desc',
          },
        },
      ],

    });

    // const tasks = await prisma.task.findMany({
    //   where: {
    //     supplierId: req.user.id,
    //   },
    //   include: {
    //     boat: true,
    //     supplier: true,
    //   },
    //   orderBy: [
    //     { date_scheduled_from: 'desc' },
    //     { id: 'desc' },
    //   ],
    // });

    const formattedTaskSupplierEntries = taskSupplierEntries.map((entry) => {
      const totalServices = entry.task?.TaskServices?.length || 0;

      return {
        ...entry,
        totalServices,
        task: entry.task
          ? {
            ...entry.task,
            totalServices,
          }
          : entry.task,
      };
    });

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, formattedTaskSupplierEntries);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export async function getTaskById(req, res) {
  try {
    const taskId = Number(req.params.taskId);

    if (!taskId || isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Valid task id is required",
      });
    }
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { supplierId: req.user.id },
          {
            TaskSupplierOffer: {
              some: {
                supplierId: req.user.id,
                status: { in: ["PENDING", "ACCEPTED"] },
              },
            },
          },
        ],
      },
      include: {
        boat: true,
        supplier: true,
        TaskServices: {
          select: {
            id: true,
            serviceId: true,
            serviceName: true,
            servicePrice: true,
          },
        },
        TaskPhoto: true,
        JobServiceSheet: {
          include: {
            Material: true,
          },
        },
        TaskSupplierOffer: {
          where: {
            supplierId: req.user.id,
          },
          select: {
            id: true,
            status: true,
            responded_at: true,
            offered_price: true,
          },
        },
      },
    });
    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
    }

    const extraPartRequests = await getExtraPartRequestsForTask({
      taskId: task.id,
      requesterType: "SUPPLIER",
      requesterId: req.user.id,
    });

    const availableParts = await getAvailablePartsForTaskUser(task.userId);

    const serviceItems = task.TaskServices.map((service) => ({
      taskServiceId: service.id,
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      servicePrice: Number(service.servicePrice || 0),
      cost: Number(service.servicePrice || 0),
    }));

    const responseData = {
      id: task.id,
      description: task.description,
      time_alloted: task.time_alloted,
      quoted_value: task.quoted_value,
      status: task.status,
      assign_to: task.assign_to,
      date_scheduled_from: task.date_scheduled_from,
      date_scheduled_to: task.date_scheduled_to,
      taskInfo: task.taskInfo,
      supplierNotes: task.supplierNotes,
      futureWatchList: task.futureWatchList,
      recommendedDueDate: task.recommendedDueDate,
      ownerApprovalStatus: task.ownerApprovalStatus,
      totalServices: task.TaskServices.length,
      boat: task.boat,
      supplier: task.supplier,
      offer: task.TaskSupplierOffer[0] || null,
      services: serviceItems.map((service) => service.serviceName),
      TaskServices: task.TaskServices.map((service) => ({
        id: service.id,
        taskServiceId: service.id,
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        task_description: task.taskDescription,
        servicePrice: Number(service.servicePrice || 0),
      })),
      photos: task.TaskPhoto,
      extraPartRequests,
      availableParts,
      jobServiceSheets: task.JobServiceSheet.map((sheet) => ({
        ...sheet,
        materials: sheet.Material || [],
      })),
      createdAt: task.createdAt,
      completed_at: task.completed_at,
    };

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, responseData);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

export async function getJobDetailById(req, res) {
  try {
    const taskId = Number(req.params.taskId);

    if (!taskId || isNaN(taskId)) {
      return createErrorResponse(res, 400, "Task id is required");
    }

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { supplierId: req.user.id },
          {
            TaskSupplierOffer: {
              some: {
                supplierId: req.user.id,
                status: { in: ["PENDING", "ACCEPTED"] },
              },
            },
          },
        ],
      },
      include: {
        boat: true,
        user: true,
        supplier: true,
        TaskServices: true,
        TaskPhoto: true,
        JobServiceSheet: {
          include: {
            Material: true,
          },
          orderBy: {
            id: "desc",
          },
        },
      },
    });

    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
    }

    const extraPartRequests = await getExtraPartRequestsForTask({
      taskId: task.id,
      requesterType: "SUPPLIER",
      requesterId: req.user.id,
    });

    const availableParts = await getAvailablePartsForTaskUser(task.userId);

    const primaryJobSheet = task.JobServiceSheet?.[0] || null;

    const services = task.TaskServices.map((service) => ({
      serviceId: service.id,
      taskServiceId: service.id,
      serviceName: service.serviceName || "-",
      description: service.description || "No description available",
      cost: Number(service.servicePrice || 0),
      servicePrice: Number(service.servicePrice || 0),
    }));

    const materials = (primaryJobSheet?.Material || []).map((material) => ({
      id: material.id,
      materialName: material.materialName,
      unitsUsed: Number(material.unitsUsed || 0),
      pricePerUnit: Number(material.pricePerUnit || 0),
      totalPrice: Number(material.totalPrice || 0),
    }));

    const servicesTotal = services.reduce(
      (sum, item) => sum + Number(item.cost || 0),
      0
    );

    const materialsTotal = materials.reduce(
      (sum, item) => sum + Number(item.totalPrice || 0),
      0
    );

    const responseData = {
      taskId: task.id,
      boatId: task.boatId,
      boatName: task.boat?.name || "-",
      ownerName: task.boat?.owners_name || task.user?.company_name || "-",
      mobile: task.supplier?.phone_no || "-",
      maintenanceDescription: task.description || "-",
      quotedValue: task.quoted_value || "0",
      jobId: task.jobNumber || task.id,
      timeAllocatedHours: task.time_alloted || "0",
      startDate: task.date_scheduled_from,
      endDate: task.date_scheduled_to,
      totalServices: task.TaskServices.length,
      services,
      TaskServices: task.TaskServices,
      photos: task.TaskPhoto || [],
      extraPartRequests,
      availableParts,
      serviceSheet: {
        exists: !!primaryJobSheet,
        jobServiceSheetId: primaryJobSheet?.id || null,
        date: primaryJobSheet?.date || task.date_scheduled_from || null,
        jobNumber: primaryJobSheet?.jobNumber || task.jobNumber || String(task.id),
        personAttending:
          primaryJobSheet?.personAttending ||
          `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() ||
          req.user.company_name ||
          "-",
        customerName:
          primaryJobSheet?.customerName ||
          task.boat?.owners_name ||
          task.user?.company_name ||
          "-",
        mobile:
          primaryJobSheet?.mobile ||
          task.supplier?.phone_no ||
          "-",
        workToBeCarriedOut:
          primaryJobSheet?.workToBeCarriedOut ||
          task.description ||
          "",
        workCarriedOut:
          primaryJobSheet?.workCarriedOut ||
          "",
        furtherActionRequired:
          primaryJobSheet?.furtherActionRequired ||
          "",
        cdsSignature:
          primaryJobSheet?.cdsSignature ||
          "",
        materials,
      },
      costSummary: {
        servicesTotal,
        materialsTotal,
        grandTotal: servicesTotal + materialsTotal,
      },
      meta: {
        status: task.status,
        assign_to: task.assign_to,
        ownerApprovalStatus: task.ownerApprovalStatus,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    };

    return createSuccessResponse(
      res,
      200,
      true,
      "Supplier job detail fetched successfully",
      responseData
    );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

export async function getCommencedTaskDetailById(req, res) {
  try {
    const taskId = Number(req.params.taskId);

    if (!taskId || isNaN(taskId)) {
      return createErrorResponse(res, 400, "Task id is required");
    }

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { supplierId: req.user.id },
          {
            TaskSupplierOffer: {
              some: {
                supplierId: req.user.id,
                status: { in: ["PENDING", "ACCEPTED"] },
              },
            },
          },
        ],
      },
      include: {
        boat: true,
        supplier: true,
        TaskPhoto: true,
      },
    });

    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
    }

    const responseData = {
      taskId: task.id,
      boatId: task.boatId,
      boatName: task.boat?.name || "-",
      startDate: task.date_scheduled_from,
      endDate: task.date_scheduled_to,
      taskDescription: task.description || "-",
      taskInfo: task.taskInfo || "",
      supplierNotes: task.supplierNotes || "",
      futureWatchList: task.futureWatchList || "",
      recommendedDueDate: task.recommendedDueDate,
      status: task.status,
      quotedValue: task.quoted_value || "0",
      timeAllocatedHours: task.time_alloted || "0",
      images: (task.TaskPhoto || []).map((photo) => ({
        id: photo.id,
        url: photo.url ? `${baseurl}/profile/${photo.url}` : null,
        createdAt: photo.createdAt,
      })),
      meta: {
        assign_to: task.assign_to,
        ownerApprovalStatus: task.ownerApprovalStatus,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    };

    return createSuccessResponse(
      res,
      200,
      true,
      "Commenced task detail fetched successfully",
      responseData
    );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

export async function deleteFile(req, res) {
  try {
    const { id } = req.params;
    const schema = Joi.alternatives(
      Joi.object({
        id: Joi.number().required()
      })
    );

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
    const file = await prisma.supplierInsuranceFile.findFirst({
      where: {
        id: parseInt(id),
        supplierId: req.user.id
      }
    })
    if (!file) {
      return createErrorResponse(res, 404, true, MessageEnum.FILE_NOT_FOUND);
    }
    await prisma.supplierInsuranceFile.delete({
      where: {
        id: parseInt(id),
        supplierId: req.user.id
      }
    })
    return createSuccessResponse(res, 200, true, MessageEnum.FILE_DELTED);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }

}

export const respondToTaskOffer = async (req, res) => {
  try {
    const { taskId, action } = req.body; // action = "ACCEPT" or "REJECT"
    const supplierId = req.user.id;

    const schema = Joi.object({
      action: Joi.string().valid('ACCEPT', 'REJECT').required(), // Enum validation
      taskId: Joi.number().integer().required()
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

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        boat: true,
        user: true
      }
    });
    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
    }

    // CASE: ACCEPT
    if (action === "ACCEPT") {
      if (task.supplierId && task.supplierId !== req.user.id) {
        // Already assigned
        return createErrorResponse(res, 404, MessageEnum.TASK_ALREADY_ACCEPTED);
      }

      // Accept this supplier
      await prisma.task.update({
        where: { id: taskId },
        data: {
          supplierId: supplierId,
        },
      });

      // Update offers
      await prisma.taskSupplierOffer.updateMany({
        where: {
          taskId,
          supplierId,
        },
        data: {
          status: "ACCEPTED",
        },
      });

      await prisma.taskSupplierOffer.updateMany({
        where: {
          taskId,
          supplierId: { not: supplierId },
        },
        data: {
          status: "REJECTED",
        },
      });

      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
      });

      let mailOptions = {
        from: `noreply@first-mate.net`,
        to: task.user.email,
        subject: `Job Accepted`,
        template: "taskAccepted",
        context: {
          admin_name: task.user.first_name || "Admin",
          supplier_name: supplier.first_name + " " + supplier.last_name,
          supplier_company: supplier.company_name || "N/A",
          supplier_email: supplier.email,
          supplier_phone: supplier.phone_no || "N/A",
          task_description: task.description,
          job_number: task.jobNumber || "N/A",
          boat_name: task.boat?.name || "N/A",
          scheduled_from: task.date_scheduled_from.toLocaleString(),
          scheduled_to: task.date_scheduled_to.toLocaleString(),
          marineManagerLink: "https://fmservicehub.com/maintenance-task",
        },
      };


      transporter.sendMail(mailOptions, async function (error, info) {
        console.log('error', error);
        if (error) {
          console.log("Error sending mail ", error)
        } else {
          console.log("Mail sent Successfully")
        }
      });

      return createSuccessResponse(res, 200, true, MessageEnum.TASK_ACCEPTED);

    }

    // CASE: REJECT
    if (action === "REJECT") {
      await prisma.taskSupplierOffer.updateMany({
        where: {
          taskId,
          supplierId,
        },
        data: {
          status: "REJECTED",
        },
      });
      return createSuccessResponse(res, 200, true, MessageEnum.TASK_REJECTED);
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


export async function getSupplierRoles(req, res) {
  try {

    const roles =
      await prisma.masterCategory.findMany({
        where: {
          status: 1
        },
        orderBy: {
          name: "asc"
        }
      });

    return createSuccessResponse(
      res,
      200,
      true,
      "Roles fetched successfully",
      roles
    );

  } catch (error) {

    console.log(error);

    return createErrorResponse(
      res,
      500,
      MessageEnum.INTERNAL_SERVER_ERROR
    );

  }
}

export async function getSupplierRoleById(req, res) {
  try {

    const role =
      await prisma.masterCategory.findUnique({
        where: {
          id: Number(req.params.id)
        }
      });

    if (!role) {
      return createErrorResponse(
        res,
        404,
        "Role not found"
      );
    }

    return createSuccessResponse(
      res,
      200,
      true,
      "Role fetched successfully",
      role
    );

  } catch (error) {

    console.log(error);

    return createErrorResponse(
      res,
      500,
      MessageEnum.INTERNAL_SERVER_ERROR
    );

  }
}