import { fileURLToPath } from 'url';
import hbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import path from 'path';
import crypto from 'crypto';
import localStorage from 'localStorage'
import { PrismaClient } from '@prisma/client';
import { getDateRanges, randomStringAsBase64Url } from '../utils/helper.js';
import { MessageEnum } from '../config/message.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responseUtil.js';
import { sendEmail } from '../utils/sendMail.js';
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


const handlebarOptions = {
  viewEngine: {
    partialsDir: path.resolve(__dirname, "../view/"),
    defaultLayout: false,
  },
  viewPath: path.resolve(__dirname, "../view/"),
};

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
    const { email, name } = req.body;
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      name: Joi.string().required(),
    });


    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message, success: false });
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
        },
      });
    } else {
      supplier = await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          token: inviteToken,
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

    // Link the supplier to the user
    await prisma.userSupplier.create({
      data: {
        userId: req.user.id,
        supplierId: supplier.id,
        name: name
      },
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

    return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_ADDED);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}


export async function editSupplier(req, res) {
  try {
    console.log("here");

    const { email, company_name, company_description, city, phone_no, id } = req.body;
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      // email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      company_name: Joi.string().optional(),
      company_description: Joi.string().optional(),
      city: Joi.string().optional(),
      phone_no: Joi.string().optional(),
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

    const supplier = await prisma.supplier.findUnique({
      where: {
        id: parseInt(id),
        userId: req.user.id
      },
    });
    if (!supplier) {
      return createErrorResponse(res, 403, MessageEnum.SUPPLIER_NOT_FOUND);
    }

    // Save the user with the hashed password using Prisma
    await prisma.supplier.update({
      where: {
        id: parseInt(id)
      },
      data: {
        company_name: company_name ? company_name : supplier.company_name,
        company_description: company_description ? company_description : supplier.company_description,
        city: city ? city : supplier.city,
        phone_no: phone_no ? phone_no : supplier.phone_no,
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.SUPPLIER_EDITED);

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
            SupplierInsuranceFile: true
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

      return {
        id: supplier.id,
        name: item.name || supplier.company_name || `${supplier.first_name || ''} ${supplier.last_name || ''}`.trim() || supplier.email,
        company_name: supplier.company_name,
        email: supplier.email,
        phone_no: supplier.phone_no,
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
      });

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
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
      error,
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
    cdsSignature,
    materials,  // New field for materials (array of material data)
  } = req.body;

  const schema = Joi.object({
    taskId: Joi.number().integer().required(),
    date: Joi.date().required(),
    jobNumber: Joi.string().optional(),
    personAttending: Joi.string().required(),
    customerName: Joi.string().required(),
    mobile: Joi.string().optional(),
    workToBeCarriedOut: Joi.string().optional(),
    workCarriedOut: Joi.string().optional(),
    cdsSignature: Joi.string().optional(),
    materials: Joi.array().items(Joi.object({
      materialName: Joi.string().required(),
      unitsUsed: Joi.number().required(),
      pricePerUnit: Joi.number().optional(),
      totalPrice: Joi.number().required()
    })).required(),
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
    const task = await prisma.task.findUnique({
      where: {
        id: parseInt(taskId),
        supplierId: req.user.id,
      },
      include: {
        JobServiceSheet: true
      }
    });

    if (!task) {
      return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
    }

    if (task.JobServiceSheet.length > 0) {
      return createErrorResponse(res, 400, MessageEnum.CDS_ALREADY_CREATED);
    }

    // Create the Job Service Sheet
    const jobServiceSheet = await prisma.jobServiceSheet.create({
      data: {
        date: new Date(date),
        taskId: parseInt(taskId),
        supplierId: req.user.id,
        jobNumber,
        personAttending,
        customerName,
        mobile,
        workToBeCarriedOut,
        workCarriedOut,
        cdsSignature,
      },
    });

    // Handle Materials if provided
    if (materials && materials.length > 0) {
      const materialData = materials.map((material) => {
        // const totalPrice = material.unitsUsed * (material.pricePerUnit || 0);
        return {
          jobServiceSheetId: jobServiceSheet.id,
          materialName: material.materialName,
          unitsUsed: parseFloat(material.unitsUsed),
          pricePerUnit: parseFloat(material.pricePerUnit) || null,
          totalPrice: parseFloat(material.totalPrice),
        };
      });

      // Create materials in the database
      await prisma.material.createMany({
        data: materialData,
      });
    }

    // Update task status to '2' (completed or in-progress)
    await prisma.task.update({
      where: {
        id: parseInt(taskId),
      },
      data: {
        status: 2,
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.JOB_SERVICE_SHEET, jobServiceSheet);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
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

// export async function changePassword(req, res) {
//   try {
//     const { password, confirm_password } = req.body;
//     const token = JSON.parse(localStorage.getItem('vertoken'));
//     const schema = Joi.alternatives(
//       Joi.object({
//         password: Joi.string().min(8).required().messages({
//           "any.required": "{{#label}} is required!!",
//           "string.empty": "can't be empty!!",
//           "string.min": "minimum 8 value required",
//           "string.max": "maximum 10 values allowed",
//         }),
//         confirm_password: Joi.string().min(8).required().messages({
//           "any.required": "{{#label}} is required!!",
//           "string.empty": "can't be empty!!",
//           "string.min": "minimum 8 value required",
//           "string.max": "maximum 10 values allowed",
//         }),
//       })
//     )
//     const result = schema.validate({ password, confirm_password });
//     if (result.error) {
//       const message = result.error.details.map((i) => i.message).join(",");
//       res.render(path.join(__dirname, '../view/', 'forgetPasswordSupplier.ejs'), {
//         message: result.error.details[0].message,
//         error: message,
//         missingParams: result.error.details[0].message,
//         msg: message
//       });

//     }
//     else {
//       if (password == confirm_password) {
//         const suppliers = await prisma.supplier.findFirst({
//           where: {
//             token: token
//           }
//         });
//         if (suppliers) {
//           const hashedPassword = await argon2.hash(password);
//           await prisma.supplier.update({
//             where: {
//               id: suppliers.id
//             },
//             data: {
//               password: hashedPassword
//             }
//           })
//           // console.log("result2",result2)
//           res.sendFile(path.join(__dirname, '../view/message.html'), { msg: "" });
//           // else {
//           //   res.render(path.join(__dirname ,'../view/', 'forgetPassword.ejs'), { msg: "Internal Error Occured, Please contact Support." });
//           // }
//         }
//         else {
//           return res.json({
//             message: "User not found please register your account",
//             success: false,
//             status: 400,
//           })
//         }
//       }
//       else {
//         res.render(path.join(__dirname, '../view/', 'forgetPassword.ejs'),
//           { msg: "Password and Confirm Password do not match" });
//       }
//     }
//   }
//   catch (error) {
//     console.log(error);

//     res.render(path.join(__dirname, '/view/', 'forgetPassword.ejs'),
//       { msg: "Internal server error" })
//   }
// };

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
        SupplierInsuranceFile: true
      }
    })

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
      abn
    } = req.body;
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
      complete_profile_status: 1
    };

    await prisma.supplier.update({
      where: { id: req.user.id },
      data: supplierData,
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
    });

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
      abn
    } = req.body;
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
    };

    await prisma.supplier.update({
      where: { id: req.user.id },
      data: supplierData,
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
    });

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

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, taskSupplierEntries);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

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


