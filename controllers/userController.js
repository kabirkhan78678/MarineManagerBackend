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
import Stripe from "stripe";
const stripe = new Stripe("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");
import { createErrorResponse, createSuccessResponse } from '../utils/responseUtil.js';
import {
  handleSuccess,
  handleError
} from '../utils/responseHandler.js';

const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_BLOCKED_MARKER = "ADMIN_BLOCKED::";

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

export async function signup(req, res) {
  try {
    console.log("here");

    const { email, password, first_name, last_name, company_name, phone_no, planId, paymentMethodId } = req.body;
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      password: Joi.string().min(8).required(),
      first_name: Joi.string().max(255).required(),
      last_name: Joi.string().max(255).required(),
      company_name: Joi.string().max(255).required(),
      phone_no: Joi.string().max(255).required(),
      planId: Joi.number().integer().required(),
      paymentMethodId: Joi.string().max(255).required(),
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

    const user = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });

    if (user) {
      return res.status(400).json({
        success: false,
        message: "Already have an account, Please Login",
        status: 400,
      });
    }

    const act_token = crypto.randomBytes(16).toString('hex');
    let mailOptions = {
      from: 'noreply@first-mate.net',
      to: email,
      subject: 'Activate Account',
      template: 'signupemail',
      context: {
        href_url: `${baseurl}/users/verifyUser/${act_token}`,
        image_logo: `${baseurl}/image/logo.png`,
        msg: `Please click below link to activate your account.`,
      },
    };

    transporter.sendMail(mailOptions, async function (error, info) {
      console.log('error', error);
      if (error) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: 'Mail Not delivered',
        });
      } else {
        const hashedPassword = await argon2.hash(password); // Using argon2 to hash the password
        console.log(hashedPassword);

        // Save the user with the hashed password using Prisma
        const user = await prisma.user.create({
          data: {
            email: email,
            first_name,
            last_name,
            company_name,
            password: hashedPassword,
            act_token: act_token,
            phone_no
          },
        });
        console.log('account created');


        // Step 2: Create Stripe Customer
        const customer = await stripe.customers.create({
          email: email,
          name: `${first_name} ${last_name}`,
          payment_method: paymentMethodId,
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        const plan = await prisma.plan.findUnique({
          where: {
            id: parseInt(planId)
          }
        })

        // Step 3: Start a 30-Day Trial
        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: plan.stripePriceId }], // Replace with actual Stripe Price ID
          trial_period_days: 30,
          //expand: ["latest_invoice.payment_intent"],
        });

        // Step 4: Store Trial Info in DB
        const { endOfThirtyDays, startOfToday } = getDateRanges();

        await prisma.subscription.create({
          data: {
            planId: parseInt(planId),
            stripeCustomerId: customer.id,
            userId: user.id,
            stripeSubscriptionId: subscription.id,
            start_date: startOfToday,
            trial_end_date: endOfThirtyDays,
            sub_status: -1, // Trial Mode
          },
        });


        await prisma.user.update({
          where: {
            id: parseInt(user.id)
          },
          data: {
            stripeCustomerId: customer.id
          }
        })

        return res.status(200).json({
          success: true,
          message: "We’ve sent a verification email. Please check your inbox, click the link to verify, and then return to the login page to access ServiceHub.",
          status: 200,
        });
      }
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
      error: error,
    });
  }
}

export async function verifyUserEmail(req, res) {
  try {
    const act_token = req.params.id;
    // const token = generateToken();
    if (!act_token) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    }
    else {
      console.log("act_token", act_token);
      const user = await prisma.user.findFirst({
        where: {
          act_token: act_token
        }
      })
      if (user) {
        const updateUser = await prisma.user.update({
          where: {
            id: user.id
          },
          data: {
            isVerified: true
          }
        })
        if (updateUser) {
          res.sendFile(path.join(__dirname, '../view/verify.html'));
        }
        else {
          res.sendFile(path.join(__dirname, '../view/notverify.html'));
        }
      }
      else {
        res.sendFile(path.join(__dirname, '../view/notverify.html'));
      }
    }
  }
  catch (error) {
    console.log(error);
    res.send(`<div class="container">
        <p>404 Error, Page Not Found</p>
        </div> `);
  }
};

export async function login(req, res) {
  try {
    const secretKey = process.env.SECRET_KEY;

    const { email, password, fcm_token } = req.body;

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
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !(await argon2.verify(user.password, password))) {
        return res.status(400).json({
          success: false,
          message: "Invalid login credentials",
          status: 400,
        });
      }


      if (user.isVerified === false && user.act_token?.startsWith(ADMIN_BLOCKED_MARKER)) {
        return res.status(400).json({
          message: "Your account has been blocked by the administrator. Please contact support for further assistance.",
          status: 400,
          success: false,
        });
      }

      if (user.isVerified === false) {
        return res.status(400).json({
          message: "Please verify your account",
          status: 400,
          success: false,
        });
      }

      const userData = await prisma.user.findUnique({
        where: { email },
      });

      if (fcm_token) {
        console.log("token", fcm_token)
        await prisma.user.update({
          where: {
            id: userData.id
          },
          data: {
            fcm_token: fcm_token
          }
        })
      }

      const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '24w' });
      return res.json({
        status: 200,
        success: true,
        message: "Login successful!",
        data: {
          token, userData
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

export async function markTooltipSeen(req, res) {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { tooltipSeen: true },
      select: {
        id: true,
        tooltipSeen: true,
      },
    });

    return createSuccessResponse(res, 200, true, "Tooltip status updated.", updatedUser);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
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
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        }
      })
      if (user) {
        if (user.isVerified == 0 && user.act_token?.startsWith(ADMIN_BLOCKED_MARKER)) {
          return res.status(400).json({
            success: false,
            message: "Your account has been blocked by the administrator. Please contact support for further assistance.",
            status: 400,
          });
        }

        if (user.isVerified == 0) {
          return res.status(400).json({
            success: false,
            message: "Please verify your account",
            status: 400,
          });
        }
        const genToken = randomStringAsBase64Url(20);
        await prisma.user.update({
          where: {
            email: email
          },
          data: {
            token: genToken
          }
        })

        const userToken = (await prisma.user.findUnique({
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
            image_logo: `${baseurl}/Logo.png`,
            href_url: `${baseurl}/users/verifyPassword/${userToken}`,
            msg: `Please click below link to change password.`,
          },
        };
        transporter.sendMail(mailOptions, async function (error, info) {
          if (error) {
            return res.json({
              success: false,
              message: error,
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
          message: "Email not found. Please check your email or sign up to create an account.",
          status: 400,
        });
      }
    }
  } catch (error) {
    console.log(error);
    return res.json({
      success: false,
      message: "Internal server error",
      status: 500,
      error: error,
    });
  }
};

export async function verifyPassword(req, res) {
  try {
    const id = req.params.token;

    console.log(id)

    if (!id) {
      return res.status(400).send("Invalid link");
    }
    else {
      const user = await prisma.user.findFirst({
        where: {
          token: id
        }
      })
      const token = user.token;
      if (token) {
        console.log("here is the vertoken");
        localStorage.setItem('vertoken', JSON.stringify(token));
        res.render(path.join(__dirname, '../view/', 'forgetPassword.ejs'), { msg: "" });
      }
      else {
        res.render(path.join(__dirname, '../view/', 'forgetPassword.ejs'), { msg: "This User is not Registered" });

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
      res.render(path.join(__dirname, '../view/', 'forgetPassword.ejs'), {
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        msg: message
      });

    }
    else {
      if (password == confirm_password) {
        const user = await prisma.user.findFirst({
          where: {
            token: token
          }
        });
        if (user) {
          const hashedPassword = await argon2.hash(password);
          await prisma.user.update({
            where: {
              id: user.id
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

export const changePasswordapi = async (req, res) => {

  try {
    const {
      token,
      current_password,
      password,
      confirm_password
    } = req.body

    if (!token || !current_password || !password || !confirm_password) {
      return handleError(
        res,
        400,
        'Token, current password, password, and confirm password are required'
      )
    }

    if (password !== confirm_password) {
      return handleError(
        res,
        400,
        'Password and confirm password do not match'
      )
    }

    let user = await prisma.user.findFirst({
      where: {
        token: token
      }
    })

    if (!user) {
      try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY)
        if (decoded?.userId) {
          user = await prisma.user.findUnique({
            where: {
              id: Number(decoded.userId)
            }
          })
        }
      } catch (err) {
        // ignore invalid JWT and keep using reset-token path
      }
    }

    if (!user) {
      return handleError(
        res,
        404,
        'Invalid or expired token'
      )
    }

    // Verify current password
    const isCurrentPasswordValid = await argon2.verify(user.password, current_password)

    if (!isCurrentPasswordValid) {
      return handleError(
        res,
        401,
        'Current password is incorrect'
      )
    }

    const hashedPassword = await argon2.hash(password)

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        password: hashedPassword,
        token: null
      }
    })

    return handleSuccess(
      res,
      200,
      'Password changed successfully',
      []
    )

  } catch (error) {
    console.log('changePassword Error => ', error)

    return handleError(
      res,
      500,
      MessageEnum.INTERNAL_SERVER_ERROR
    )
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
      BSB, ACC,
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
      BSB: Joi.string().max(255).required(),
      ACC: Joi.string().max(255).required(),
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

    let profile_image = null;
    let company_logo = null;
    let trade_license = null;
    if (req.files && req.files['profile_image'] && req.files['profile_image'][0]) {
      profile_image = req.files['profile_image'][0].filename;
    }

    if (req.files && req.files['logo'] && req.files['logo'][0]) {
      company_logo = req.files['logo'][0].filename;
    }


    if (req.files && req.files['trade_license'] && req.files['trade_license'][0]) {
      trade_license = req.files['trade_license'][0].filename;
    }


    const userData = {
      company_name: company_name || req.user.company_name,
      first_name: first_name ? first_name : req.user.first_name,
      last_name: last_name ? last_name : req.user.last_name,
      ACC: ACC ? ACC : req.user.ACC,
      BSB: BSB ? BSB : req.user.BSB,
      profile_image: profile_image || req.user.profile_image,
      company_logo: company_logo || req.user.company_logo,
      trade_license: trade_license || req.user.trade_license,
      accounting_software_used: accounting_software_used !== null && accounting_software_used !== undefined ? accounting_software_used : req.user.accounting_software_used,
      about_us: about_us !== null && about_us !== undefined ? about_us : req.user.about_us,
      service_region: service_region !== null && service_region !== undefined ? service_region : req.user.service_region,
      phone_no: phone_no || req.user.phone_no,
      services_offered: services_offered !== null && services_offered !== undefined ? services_offered : req.user.services_offered,
      abn: abn !== null && abn !== undefined ? abn : req.user.abn,
    };

    await prisma.user.update({
      where: { id: req.user.id },
      data: userData,
    });

    if (req.files && req.files['insurance']) {
      for (const file of req.files['insurance']) {
        await prisma.insuranceFile.create({
          data: {
            filename: file.filename,
            userId: req.user.id,
          }
        });
      }
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (updatedUser?.profile_image) {
      updatedUser.profile_image = `${baseurl}/profile/${updatedUser.profile_image}`;
    }
    if (updatedUser?.company_logo) {
      updatedUser.company_logo = `${baseurl}/profile/${updatedUser.company_logo}`;
    }
    if (updatedUser?.trade_license) {
      updatedUser.trade_license = `${baseurl}/profile/${updatedUser.trade_license}`;
    }

    return createSuccessResponse(res, 200, true, MessageEnum.PROFILE_UPDATED, updatedUser);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
}


export async function myProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id
      },
      include: {
        InsuranceFile: true
      }
    })

    if (user.company_logo) {
      user.company_logo = `${baseurl}/profile/${user.company_logo}`
    }
    if (user.profile_image) {
      user.profile_image = `${baseurl}/profile/${user.profile_image}`
    }
    if (user.trade_license) {
      user.trade_license = `${baseurl}/profile/${user.trade_license}`
    }

    if (user.InsuranceFile.length > 0) {

      await Promise.all(user.InsuranceFile.map((file) => {
        file.filename = `${baseurl}/profile/${file.filename}`
      }))

    }

    createSuccessResponse(res, 200, true, MessageEnum.PROFILE_DATA, user);


  } catch (error) {
    console.log(error);
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
    await prisma.insuranceFile.delete({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    })
    createSuccessResponse(res, 200, true, MessageEnum.FILE_DELTED);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }

}

export async function getOwners(req, res) {
  try {
    const owners = await prisma.user.findMany({
      where: {
        isVerified: true,
      },
      orderBy: {
        company_name: 'asc',
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        company_name: true,
        phone_no: true,
        service_region: true,
        company_logo: true,
      },
    });

    const payload = owners.map((owner) => ({
      id: owner.id,
      name: owner.company_name || `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || owner.email,
      company_name: owner.company_name,
      email: owner.email,
      phone_no: owner.phone_no,
      service_region: owner.service_region,
      profile_image: owner.company_logo ? `${baseurl}/profile/${owner.company_logo}` : null,
    }));

    return createSuccessResponse(res, 200, true, 'Owner list fetched successfully', payload);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

//august sprint 

export const updateJobServiceSheet = async (req, res) => {
  const {
    jobServiceSheetId,
    materials,
  } = req.body;

  const schema = Joi.object({
    jobServiceSheetId: Joi.number().integer().required(),
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
    const jobServiceSheet = await prisma.jobServiceSheet.findUnique({
      where: {
        id: parseInt(jobServiceSheetId)
      }
    })

    if (!jobServiceSheet) {
      return createErrorResponse(res, 404, MessageEnum.CDS_JOB_NOT_FOUND);

    }

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

      await prisma.material.deleteMany({
        where: {
          jobServiceSheetId: parseInt(jobServiceSheetId)
        }
      })

      // Create materials in the database
      await prisma.material.createMany({
        data: materialData,
      });
    }

    return createSuccessResponse(res, 200, true, MessageEnum.JOB_SERVICE_SHEET, jobServiceSheet);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

const formatSupplierJobHistory = (
  job,
  index = 0
) => {

  let status = "PENDING";

  let statusUI = {
    label: "Pending",
    color: "#F59E0B",
  };

  if (job.status === 4) {

    status = "COMPLETED";

    statusUI = {
      label: "Completed",
      color: "#22C55E",
    };
  }

  else if (
    job.date_scheduled_to &&
    new Date(job.date_scheduled_to) < new Date()
  ) {

    status = "OVERDUE";

    statusUI = {
      label: "Overdue",
      color: "#EF4444",
    };
  }

  const assignedDate =
    job.createdAt
      ? new Date(job.createdAt)
        .toLocaleDateString("en-GB")
      : "-";

  const dueDate =
    job.date_scheduled_to
      ? new Date(job.date_scheduled_to)
        .toLocaleDateString("en-GB")
      : "-";

  return {

    taskId: job.id,

    // =========================
    // FIGMA TABLE DATA
    // =========================

    serialNumber: index + 1,

    jobName:
      `#${job.jobNumber || "N/A"}`,

    boatReg:
      job.boat?.rego || "#N/A",

    scheduledDate:
      `${assignedDate} - ${dueDate}`,

    status,

    statusUI,

    // =========================
    // EXISTING RESPONSE
    // =========================

    jobNumber:
      job.jobNumber || `#${job.id}`,

    boatName:
      job.boat?.name || "-",

    rego:
      job.boat?.rego || "-",

    boatStatus:
      getBoatStatus(job.boat),

    ownerName:
      job.user?.company_name ||
      job.user?.full_name ||
      "-",

    assignedDate,

    dueDate,

    completedDate:
      job.completed_at
        ? new Date(job.completed_at)
          .toLocaleDateString("en-GB")
        : null,

    quotedValue:
      job.quoted_value || "0",

    servicesCount:
      job.TaskServices?.length || 0,

    services:
      job.TaskServices?.map(
        (service) =>
          service.serviceName
      ) || [],

    invoice: {

      exists:
        !!job.invoiceId,

      invoiceId:
        job.invoiceId || null,
    },
  };
};

function buildJobHistory(tasks) {
  return tasks.map((task) => ({
    ...formatSupplierJobHistory(task),
  }));
}

function getBoatStatus(boat) {
  return boat?.DockBooking?.length
    ? "assigned"
    : "unassigned";
}

function getTaskJobStatus(task) {
  if (task.status === 1 || task.timer_status === "COMPLETED") {
    return "completed";
  }

  if (task.timer_status === "STARTED" || task.timer_status === "PAUSED") {
    return "in progress";
  }

  return "assigned";
}

function buildJobSummary(tasks) {
  return {
    total_jobs: tasks.length,
    in_progress_jobs: tasks.filter((task) => getTaskJobStatus(task) === "in progress").length,
    completed_jobs: tasks.filter((task) => getTaskJobStatus(task) === "completed").length,
  };
}

function buildSupplierActivityTracker(tasks = []) {

  const now = new Date();

  const completedTasks =
    tasks.filter(
      (task) =>
        task.status === 1
    );

  const pendingTasks =
    tasks.filter(
      (task) =>
        task.status === 0
    );

  const inProgressTasks =
    tasks.filter(
      (task) =>
        task.timer_status === "STARTED" ||
        task.timer_status === "PAUSED"
    );

  const overdueTasks =
    tasks.filter(
      (task) =>
        task.date_scheduled_to &&
        new Date(task.date_scheduled_to) < now &&
        task.status !== 1
    );

  const acceptedOffers =
    tasks.filter(
      (task) =>
        task.TaskSupplierOffer?.some(
          (offer) =>
            offer.status === "ACCEPTED"
        )
    ).length;

  const rejectedOffers =
    tasks.filter(
      (task) =>
        task.TaskSupplierOffer?.some(
          (offer) =>
            offer.status === "REJECTED"
        )
    ).length;

  const totalPhotos =
    tasks.reduce(
      (acc, task) =>
        acc + (task.TaskPhoto?.length || 0),
      0
    );

  const totalServices =
    tasks.reduce(
      (acc, task) =>
        acc + (task.TaskServices?.length || 0),
      0
    );

  const totalMaterials =
    tasks.reduce((acc, task) => {

      const materials =
        task.JobServiceSheet?.reduce(
          (sum, sheet) =>
            sum + (sheet.Material?.length || 0),
          0
        ) || 0;

      return acc + materials;

    }, 0);

  const totalHours =
    tasks.reduce(
      (acc, task) =>
        acc + ((task.total_active_minutes || 0) / 60),
      0
    );

  const completionRate =
    tasks.length > 0
      ? Math.round(
        (completedTasks.length / tasks.length) * 100
      )
      : 0;

  return {

    performance_summary: {

      total_jobs:
        tasks.length,

      completed_jobs:
        completedTasks.length,

      pending_jobs:
        pendingTasks.length,

      in_progress_jobs:
        inProgressTasks.length,

      overdue_jobs:
        overdueTasks.length,

      completion_rate:
        completionRate,
    },

    supplier_engagement: {

      accepted_offers:
        acceptedOffers,

      rejected_offers:
        rejectedOffers,

      response_rate:
        tasks.length > 0
          ? Math.round(
            (acceptedOffers / tasks.length) * 100
          )
          : 0,
    },

    work_activity: {

      total_services:
        totalServices,

      total_uploaded_photos:
        totalPhotos,

      total_materials_used:
        totalMaterials,

      total_working_hours:
        Number(totalHours.toFixed(2)),

      average_job_time_hours:
        tasks.length > 0
          ? Number(
            (totalHours / tasks.length).toFixed(2)
          )
          : 0,
    },

    live_status: {

      currently_working:
        inProgressTasks.length > 0,

      active_jobs:
        inProgressTasks.length,

      last_completed_job:
        completedTasks[0]?.jobNumber || null,
    },
  };
}

function getPublicProfileFileUrl(fileName) {
  if (!fileName) return null;
  return `${baseurl}/profile/${fileName}`;
}

function buildDocumentList({ tradeLicense, insuranceFiles = [] }) {
  const documents = [];

  if (tradeLicense) {
    documents.push({
      name: "Trade License",
      type: "trade_license",
      url: getPublicProfileFileUrl(tradeLicense),
    });
  }

  insuranceFiles.forEach((file, index) => {
    if (!file?.filename) return;

    documents.push({
      name: `Insurance Document ${index + 1}`,
      type: "insurance",
      url: getPublicProfileFileUrl(file.filename),
    });
  });

  return documents;
}

function getUserStatusLabel(isActive) {
  return isActive ? "active" : "inactive";
}

function getSupplierDisplayName(supplier) {
  const fullName = `${supplier.first_name || ""} ${supplier.last_name || ""}`.trim();
  return fullName || supplier.company_name || supplier.email;
}

function getSupplierBasePortName(supplier) {
  return supplier?.service_region || supplier?.city || null;
}

function getOwnerDisplayName(user) {
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return fullName || user.company_name || user.email;
}

function buildOwnerContactCard(owner) {
  if (!owner) return null;

  return {
    id: owner.id,
    company_name: owner.company_name,
    owner_name: getOwnerDisplayName(owner),
    email: owner.email,
    phone_number: owner.phone_no,
    owner_address: owner.service_region || null,
    logo_url: getPublicProfileFileUrl(owner.company_logo),
  };
}

function splitServicesOffered(value) {
  if (!value) return [];
  return String(value)
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSupplierDetailPayload(supplier) {
  const primaryOwner = supplier.UserSupplier[0]?.user || supplier.Task[0]?.user || null;
  const linkedOwnerName = supplier.UserSupplier[0]?.name || null;
  const jobSummary = buildJobSummary(supplier.Task);
  const jobHistory = buildJobHistory(supplier.Task);
  const basePortName = getSupplierBasePortName(supplier);
  const documents = buildDocumentList({
    tradeLicense: supplier.trade_license,
    insuranceFiles: supplier.SupplierInsuranceFile,
  });
  const activityTracker =
    buildSupplierActivityTracker(
      supplier.Task
    );

  return {
    id: supplier.id,
    username: getSupplierDisplayName(supplier),
    user_type: "SUPPLIER",
    profile_image: getPublicProfileFileUrl(supplier.company_logo),
    email: supplier.email,
    base_port_name: basePortName,
    date_joined: supplier.createdAt,
    status: supplier.status ?? 0,
    profile_card: {
      display_name: supplier.company_name || getSupplierDisplayName(supplier),
      sub_title: basePortName,
      base_port: basePortName,
      badge: "Supplier",
      email: supplier.email,
      phone_number: supplier.phone_no,
      logo_url: getPublicProfileFileUrl(supplier.company_logo),
    },
    owner_details: primaryOwner
      ? buildOwnerContactCard(primaryOwner)
      : linkedOwnerName
        ? {
          owner_name: linkedOwnerName,
        }
        : null,
    documents,
    supplier_information: {
      username: getSupplierDisplayName(supplier),
      user_type: "Supplier",
      company_email: supplier.email,
      company_name: supplier.company_name,
      company_logo:
        getPublicProfileFileUrl(
          supplier.company_logo
        ),
      abn: supplier.abn,
      accounting_software: supplier.accounting_software_used,
      company_details: supplier.company_description || supplier.about_us,
      services_offered: supplier.services_offered,
      services_offered_list: splitServicesOffered(supplier.services_offered),
      joined_date: supplier.createdAt,
      supplier_address: basePortName,
      base_port_name: basePortName,
      supplier_phone_number: supplier.phone_no,
    },
    supplier_jobs: {
      ...jobSummary,
      job_history: jobHistory,
    },
    tabs: {
      activity_tracker:
        activityTracker,
      supplier_information: {
        account_information: {
          username: getSupplierDisplayName(supplier),
          user_type: "Supplier",
          company_email: supplier.email,
          company_name: supplier.company_name,
          abn: supplier.abn,
          accounting_software: supplier.accounting_software_used,
          base_port_name: basePortName,
          joined_date: supplier.createdAt,
        },
        company_details: supplier.company_description || supplier.about_us,
        services_offered: splitServicesOffered(supplier.services_offered),
      },
      supplier_jobs: {
        summary_cards: jobSummary,
        job_history: jobHistory,
      },
    },
  };
}

const getSupplierAccountStatus = (
  status
) => {

  switch (status) {

    case 1:
      return {
        number: 1,
        label: "Active",
        color: "#22C55E",
        backgroundColor: "#DCFCE7",
      };

    case 0:
      return {
        number: 0,
        label: "Blocked",
        color: "#EF4444",
        backgroundColor: "#FEE2E2",
      };

    default:
      return {
        number: status,
        label: "Unknown",
        color: "#6B7280",
        backgroundColor: "#F3F4F6",
      };
  }
};


export async function getSupplierById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid supplier id is required",
        status: 400,
      });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        SupplierInsuranceFile: {
          select: {
            id: true,
            filename: true,
          },
        },
        UserSupplier: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                company_name: true,
                phone_no: true,
                company_logo: true,
                service_region: true,
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
        Task: {
          include: {

            boat: {
              select: {
                id: true,
                name: true,
                rego: true,
                DockBooking: {
                  select: {
                    id: true,
                  },
                },
              },
            },

            user: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                company_name: true,
                phone_no: true,
                company_logo: true,
                service_region: true,
              },
            },

            TaskServices: true,

            TaskPhoto: true,

            JobTimerLog: true,

            JobServiceSheet: {
              include: {
                Material: true,
              },
            },

            TaskSupplierOffer: true,

          },

          orderBy: {
            id: "desc",
          },
        },
      },
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
        status: 404,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Supplier data!",
      data: buildSupplierDetailPayload(supplier),

    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
      error,
    });
  }
}

export const deleteSupplier = async (req, res) => {
  try {

    const supplierId = Number(
      req.params.supplierId
    );

    // =========================
    // VALIDATION
    // =========================

    if (!supplierId) {

      return createErrorResponse(
        res,
        400,
        "Supplier id is required"
      );
    }

    // =========================
    // FIND SUPPLIER
    // =========================

    const supplier =
      await prisma.Supplier.findFirst({

        where: {
          id: supplierId,
        },
      });

    // =========================
    // NOT FOUND
    // =========================

    if (!supplier) {

      return createErrorResponse(
        res,
        404,
        "Supplier not found"
      );
    }

    // =========================
    // CHECK OWNERSHIP
    // =========================

    const linkedSupplier =
      await prisma.UserSupplier.findFirst({

        where: {
          userId: req.user.id,
          supplierId,
        },
      });

    if (!linkedSupplier) {

      return createErrorResponse(
        res,
        403,
        "You are not allowed to delete this supplier"
      );
    }

    // =========================
    // DELETE USER SUPPLIER LINKS
    // =========================

    await prisma.UserSupplier.deleteMany({

      where: {
        supplierId,
      },
    });

    // =========================
    // DELETE TASK SUPPLIER OFFERS
    // =========================

    await prisma.TaskSupplierOffer.deleteMany({

      where: {
        supplierId,
      },
    });

    // =========================
    // DELETE INSURANCE FILES
    // =========================

    await prisma.SupplierInsuranceFile.deleteMany({

      where: {
        supplierId,
      },
    });

    // =========================
    // DELETE TASK PHOTOS
    // =========================

    await prisma.TaskPhoto.deleteMany({

      where: {
        supplierId,
      },
    });

    // =========================
    // DELETE JOB SERVICE SHEETS
    // =========================

    await prisma.JobServiceSheet.deleteMany({

      where: {
        supplierId,
      },
    });

    // =========================
    // REMOVE SUPPLIER FROM TASKS
    // =========================

    await prisma.Task.updateMany({

      where: {
        supplierId,
      },

      data: {
        supplierId: null,
      },
    });

    // =========================
    // DELETE SUPPLIER
    // =========================

    await prisma.Supplier.delete({

      where: {
        id: supplierId,
      },
    });

    // =========================
    // RESPONSE
    // =========================

    return createSuccessResponse(
      res,
      200,
      true,
      {
        en: "Supplier deleted successfully",
      },
      {}
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

export const toggleTechnicianStatus = async (
  req,
  res
) => {
  try {

    const technicianId = Number(
      req.params.technicianId
    );

    // =========================
    // VALIDATION
    // =========================

    if (!technicianId) {

      return createErrorResponse(
        res,
        400,
        "Technician id is required"
      );
    }

    // =========================
    // FIND TECHNICIAN
    // =========================

    const technician =
      await prisma.Staff_Member.findFirst({

        where: {
          id: technicianId,
        },
      });

    // =========================
    // NOT FOUND
    // =========================

    if (!technician) {

      return createErrorResponse(
        res,
        404,
        "Technician not found"
      );
    }

    // =========================
    // TOGGLE STATUS
    // =========================

    const updatedStatus =
      technician.status === 1
        ? 0
        : 1;

    // =========================
    // UPDATE TECHNICIAN
    // =========================

    const updatedTechnician =
      await prisma.Staff_Member.update({

        where: {
          id: technicianId,
        },

        data: {
          status:
            updatedStatus,
        },
      });

    // =========================
    // RESPONSE
    // =========================

    return createSuccessResponse(
      res,
      200,
      true,
      {
        en:
          updatedStatus === 1
            ? "Technician unblocked successfully"
            : "Technician blocked successfully",
      },
      {

        technicianId:
          updatedTechnician.id,

        status:
          updatedTechnician.status,

        isBlocked:
          updatedTechnician.status === 0,
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


export const toggleSupplierStatus = async (
  req,
  res
) => {
  try {

    const supplierId = Number(
      req.params.supplierId
    );

    // =========================
    // VALIDATION
    // =========================

    if (!supplierId) {

      return createErrorResponse(
        res,
        400,
        "Supplier id is required"
      );
    }

    // =========================
    // FIND SUPPLIER
    // =========================

    const supplier =
      await prisma.Supplier.findFirst({

        where: {
          id: supplierId,
        },
      });

    // =========================
    // NOT FOUND
    // =========================

    if (!supplier) {

      return createErrorResponse(
        res,
        404,
        "Supplier not found"
      );
    }

    // =========================
    // TOGGLE STATUS
    // =========================

    const updatedStatus =
      supplier.status === 1
        ? 0
        : 1;

    // =========================
    // UPDATE SUPPLIER
    // =========================

    const updatedSupplier =
      await prisma.Supplier.update({

        where: {
          id: supplierId,
        },

        data: {
          status:
            updatedStatus,
        },
      });

    // =========================
    // RESPONSE
    // =========================

    return createSuccessResponse(
      res,
      200,
      true,
      {
        en:
          updatedStatus === 1
            ? "Supplier unblocked successfully"
            : "Supplier blocked successfully",
      },
      {

        supplierId:
          updatedSupplier.id,

        status:
          updatedSupplier.status,

        isBlocked:
          updatedSupplier.status === 0,
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


export async function getSupplierWorkedBoats(req, res) {

  try {

    const supplierId =
      parseInt(req.params.supplierId);

    if (
      !supplierId ||
      Number.isNaN(supplierId)
    ) {

      return createErrorResponse(
        res,
        400,
        "Valid supplier id is required"
      );
    }

    const supplier =
      await prisma.supplier.findUnique({

        where: {
          id: supplierId
        },

        include: {

          Task: {

            where: {
              supplierId
            },

            include: {

              boat: {

                include: {

                  DockBooking: true,

                  Invoice: true,

                  JobServiceSheet: {
                    include: {
                      Material: true
                    }
                  }

                }
              },

              TaskServices: true,

              TaskPhoto: true,

            },

            orderBy: {
              id: 'desc'
            }
          }
        }
      });

    if (!supplier) {

      return createErrorResponse(
        res,
        404,
        "Supplier not found"
      );
    }

    const uniqueBoatsMap =
      new Map();

    supplier.Task.forEach((task) => {

      if (!task.boat) return;

      const existingBoat =
        uniqueBoatsMap.get(task.boat.id);

      if (existingBoat) {

        existingBoat.total_jobs += 1;

        existingBoat.completed_jobs +=
          task.status === 1 ? 1 : 0;

        existingBoat.pending_jobs +=
          task.status !== 1 ? 1 : 0;

        existingBoat.total_services +=
          task.TaskServices?.length || 0;

        existingBoat.total_photos +=
          task.TaskPhoto?.length || 0;

      } else {

        uniqueBoatsMap.set(task.boat.id, {

          boat_id:
            task.boat.id,

          boat_name:
            task.boat.name,

          rego:
            task.boat.rego,

          owner_name:
            task.user?.company_name || null,

          total_jobs:
            1,

          completed_jobs:
            task.status === 1 ? 1 : 0,

          pending_jobs:
            task.status !== 1 ? 1 : 0,

          total_services:
            task.TaskServices?.length || 0,

          total_photos:
            task.TaskPhoto?.length || 0,

          total_invoices:
            task.boat.Invoice?.length || 0,

          total_job_sheets:
            task.boat.JobServiceSheet?.length || 0,

          latest_job_date:
            task.createdAt,

          performance_status:
            task.performanceStatus,

          task_efficiency:
            task.taskEfficiency,

          completion_delay_minutes:
            task.completionDelayMinutes,

        });
      }
    });

    const boats =
      Array.from(uniqueBoatsMap.values());

    return createSuccessResponse(
      res,
      200,
      true,
      "Supplier worked boats fetched successfully",
      {
        supplier_id: supplier.id,
        supplier_name:
          supplier.company_name,

        total_boats:
          boats.length,

        boats
      }
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


export async function getSupplierWorkedBoatById(req, res) {

  try {

    const supplierId =
      parseInt(req.params.supplierId);

    const boatId =
      parseInt(req.params.boatId);

    if (
      !supplierId ||
      !boatId
    ) {

      return createErrorResponse(
        res,
        400,
        "Valid supplier id and boat id required"
      );
    }

    const boat =
      await prisma.boat.findFirst({

        where: {

          id: boatId,

          Task: {
            some: {
              supplierId
            }
          }
        },

        include: {

          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              company_name: true,
              email: true,
              phone_no: true,
            }
          },

          DockBooking: true,

          Invoice: true,

          JobServiceSheet: {
            include: {
              Material: true
            }
          },

          Task: {

            where: {
              supplierId
            },

            include: {

              TaskPhoto: true,

              TaskServices: true,

              JobTimerLog: true,

              JobServiceSheet: {
                include: {
                  Material: true
                }
              }
            },

            orderBy: {
              id: 'desc'
            }
          }
        }
      });

    if (!boat) {

      return createErrorResponse(
        res,
        404,
        "Boat not found"
      );
    }

    const totalJobs =
      boat.Task.length;

    const completedJobs =
      boat.Task.filter(
        (task) =>
          task.status === 1
      ).length;

    const totalPhotos =
      boat.Task.reduce(
        (acc, task) =>
          acc + (task.TaskPhoto?.length || 0),
        0
      );

    const totalServices =
      boat.Task.reduce(
        (acc, task) =>
          acc + (task.TaskServices?.length || 0),
        0
      );

    const totalWorkingHours =
      boat.Task.reduce(
        (acc, task) =>
          acc + (
            (task.total_active_minutes || 0) / 60
          ),
        0
      );

    return createSuccessResponse(
      res,
      200,
      true,
      "Supplier boat detail fetched successfully",
      {

        boat_information: {

          boat_id:
            boat.id,

          boat_name:
            boat.name,

          rego:
            boat.rego,

          make:
            boat.make,

          model:
            boat.model,

          engine_make:
            boat.engine_make,

          engine_model:
            boat.engine_model,

          avatar_url:
            boat.avatar_url,

          docking_date:
            boat.docking_date,

          owner: {

            id:
              boat.user?.id,

            owner_name:
              `${boat.user?.first_name || ''} ${boat.user?.last_name || ''}`,

            company_name:
              boat.user?.company_name,

            email:
              boat.user?.email,

            phone_no:
              boat.user?.phone_no,
          }
        },

        performance_summary: {

          total_jobs:
            totalJobs,

          completed_jobs:
            completedJobs,

          pending_jobs:
            totalJobs - completedJobs,

          total_services:
            totalServices,

          total_uploaded_photos:
            totalPhotos,

          total_working_hours:
            Number(
              totalWorkingHours.toFixed(2)
            ),
        },

        task_history:
          boat.Task.map((task, index) => ({

            sr_no:
              index + 1,

            task_id:
              task.id,

            job_name:
              task.description,

            quoted_value:
              task.quoted_value,

            scheduled_from:
              task.date_scheduled_from,

            scheduled_to:
              task.date_scheduled_to,

            completed_at:
              task.completed_at,

            performance_status:
              task.performanceStatus,

            task_efficiency:
              task.taskEfficiency,

            completion_delay_minutes:
              task.completionDelayMinutes,

            total_active_minutes:
              task.total_active_minutes,

            uploaded_photos:
              task.TaskPhoto?.length || 0,

            services_completed:
              task.TaskServices?.length || 0,

            materials_used:
              task.JobServiceSheet?.reduce(
                (acc, sheet) =>
                  acc + (
                    sheet.Material?.length || 0
                  ),
                0
              ) || 0,

            timer_status:
              task.timer_status,

            status:
              task.status,
          }))
      }
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

export async function createPart(req, res) {

  try {

    const {
      name,
      original_cost,
      boat_owner_cost,
      stock_quantity,
      low_stock_alert
    } = req.body;

    const schema = Joi.object({

      name:
        Joi.string().required(),

      original_cost:
        Joi.number().required(),

      boat_owner_cost:
        Joi.number().required(),

      stock_quantity:
        Joi.number().required(),

      low_stock_alert:
        Joi.number().optional(),
    });

    const { error } =
      schema.validate(req.body);

    if (error) {

      const message =
        error.details.map(
          (i) => i.message
        ).join(",");

      return createErrorResponse(
        res,
        400,
        message
      );
    }

    const part =
      await prisma.partInventory.create({

        data: {

          userId:
            req.user.id,

          name,

          original_cost:
            parseFloat(original_cost),

          boat_owner_cost:
            parseFloat(boat_owner_cost),

          stock_quantity:
            parseInt(stock_quantity),

          low_stock_alert:
            low_stock_alert
              ? parseInt(low_stock_alert)
              : 10,
        }
      });

    return createSuccessResponse(
      res,
      200,
      true,
      "Part created successfully",
      part
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


export async function getAllParts(req, res) {

  try {

    const parts =
      await prisma.partInventory.findMany({

        where: {
          userId: req.user.id
        },

        orderBy: {
          id: 'desc'
        }
      });

    const formatted =
      parts.map((part, index) => ({

        sr_no:
          index + 1,

        id:
          part.id,

        name:
          part.name,

        original_cost:
          part.original_cost,

        boat_owner_cost:
          part.boat_owner_cost,

        stock_quantity:
          part.stock_quantity,

        low_stock_alert:
          part.low_stock_alert,

        low_stock:
          part.stock_quantity <= part.low_stock_alert,
      }));

    return createSuccessResponse(
      res,
      200,
      true,
      "Parts fetched successfully",
      formatted
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

export async function getPartById(req, res) {

  try {

    const id =
      parseInt(req.params.id);

    const part =
      await prisma.partInventory.findFirst({

        where: {

          id,

          userId:
            req.user.id
        }
      });

    if (!part) {

      return createErrorResponse(
        res,
        404,
        "Part not found"
      );
    }

    return createSuccessResponse(
      res,
      200,
      true,
      "Part detail fetched successfully",
      {

        ...part,

        low_stock:
          part.stock_quantity <=
          part.low_stock_alert,
      }
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


export async function updatePart(req, res) {

  try {

    const id =
      parseInt(req.params.id);

    const existingPart =
      await prisma.partInventory.findFirst({

        where: {

          id,

          userId:
            req.user.id
        }
      });

    if (!existingPart) {

      return createErrorResponse(
        res,
        404,
        "Part not found"
      );
    }

    const {
      name,
      original_cost,
      boat_owner_cost,
      stock_quantity,
      low_stock_alert
    } = req.body;

    const updated =
      await prisma.partInventory.update({

        where: {
          id
        },

        data: {

          name,

          original_cost:
            parseFloat(original_cost),

          boat_owner_cost:
            parseFloat(boat_owner_cost),

          stock_quantity:
            parseInt(stock_quantity),

          low_stock_alert:
            parseInt(low_stock_alert),
        }
      });

    return createSuccessResponse(
      res,
      200,
      true,
      "Part updated successfully",
      updated
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


export async function deletePart(req, res) {

  try {

    const id =
      parseInt(req.params.id);

    const existingPart =
      await prisma.partInventory.findFirst({

        where: {

          id,

          userId:
            req.user.id
        }
      });

    if (!existingPart) {

      return createErrorResponse(
        res,
        404,
        "Part not found"
      );
    }

    await prisma.partInventory.delete({

      where: {
        id
      }
    });

    return createSuccessResponse(
      res,
      200,
      true,
      "Part deleted successfully"
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


