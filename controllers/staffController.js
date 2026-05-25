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
import { findTrailOrSubscription, getDateRanges, randomStringAsBase64Url } from '../utils/helper.js';
import { MessageEnum } from '../config/message.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responseUtil.js';
import { createNotification, sendNotificationRelateToTask } from '../utils/notification.js';

const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
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
export async function addStaffMember(req, res) {
  try {
    console.log("here");

    const { email, password, name, role, phone_no, home_address, hourly_rate } = req.body;
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      password: Joi.string().min(8).required(),
      name: Joi.string().max(255).required(),
      role: Joi.string().max(255).required(),
      phone_no: Joi.string().max(255).required(),
      home_address: Joi.string().required(),
      hourly_rate: Joi.number().required(),
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

    const staffMember = await prisma.staff_Member.findUnique({
      where: {
        email: email,
      },
    });
    if (staffMember) {
      return createErrorResponse(res, 403, MessageEnum.ALREADY_STAFF_MEMBER);
    }
    const hashedPassword = await argon2.hash(password); // Using argon2 to hash the password
    console.log(hashedPassword);


    //check plan or subscription

    const planDetail = await findTrailOrSubscription(req.user.id);

    if (!planDetail) {
      return createErrorResponse(res, 400, MessageEnum.NO_SUBSCRIPTION_FOUND)
    }
    const activeStaffMembers = await prisma.staff_Member.count({
      where: {
        userId: req.user.id,
        status: 1
      }
    })

    const sub_status = planDetail.sub_status;
    const max_staff_members = planDetail.plan.maxStaffUsers;

    if (activeStaffMembers >= max_staff_members && planDetail.trial_end_date != null) {
      return createErrorResponse(res, 400, MessageEnum.NOT_ALLOWED_TRAIL)
    }
    if (activeStaffMembers >= max_staff_members && max_staff_members == 5) {
      return createErrorResponse(res, 400, MessageEnum.NOT_ALLOWED_SUB)
    }
    if (activeStaffMembers >= max_staff_members && max_staff_members == 1) {
      return createErrorResponse(res, 400, MessageEnum.NOT_ALLOWED_Plan)
    }
    // Save the user with the hashed password using Prisma
    const createdStaffMember = await prisma.staff_Member.create({
      data: {
        email,
        password: hashedPassword,
        showPassword: password,
        full_name: name,
        role: role,
        phone_no,
        userId: req.user.id,
        hourly_rate: parseFloat(hourly_rate),
        home_address
      },
    });

    const mailOptions = {
      from: 'noreply@first-mate.net',
      to: email,
      subject: 'Your First Mate account has been created',
      template: 'staff_welcome',
      context: {
        name: createdStaffMember.full_name,
        email: createdStaffMember.email,
        password,
        image_logo: `${baseurl}/image/logo.png`,
      },
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (mailError) {
      console.log("staff welcome email error", mailError);
    }

    const technician = {
      id: createdStaffMember.id,
      full_name: createdStaffMember.full_name,
      role: createdStaffMember.role,
      email: createdStaffMember.email,
      phone_no: createdStaffMember.phone_no,
      status: createdStaffMember.status,
      hourly_rate: createdStaffMember.hourly_rate,
      home_address: createdStaffMember.home_address,
      total_tasks: 0,
      completed_tasks: 0,
      completion_rate: 0,
    };

    return createSuccessResponse(res, 200, true, MessageEnum.STAFF_MEMBER_ADDED, technician);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);

  }
}

export async function editStaffMember(req, res) {
  try {
    console.log("here");

    const { password, name, role, phone_no, id, home_address, status, hourly_rate } = req.body;
    console.log(req.body);
    console.log("after");

    const schema = Joi.object({
      password: Joi.string().min(8).optional(),
      name: Joi.string().max(255).optional(),
      role: Joi.string().max(255).optional(),
      phone_no: Joi.string().max(255).optional(),
      home_address: Joi.string().optional(),
      status: Joi.number().integer().optional(),
      hourly_rate: Joi.number().optional(),
      id: Joi.number().required(),
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

    const staffMember = await prisma.staff_Member.findUnique({
      where: {
        id: parseInt(id),
        userId: req.user.id
      },
    });
    if (!staffMember) {
      return createErrorResponse(res, 403, MessageEnum.STAFF_MEMBER_NOT_FOUND);
    }
    let hashedPassword = staffMember.password;
    let showPassword = staffMember.showPassword;
    if (password) {
      hashedPassword = await argon2.hash(password);
      showPassword = password
    }
    // Using argon2 to hash the password
    console.log(hashedPassword);

    if (staffMember.status === 0 && status == 1) {
      const planDetail = await findTrailOrSubscription(req.user.id);

      if (!planDetail) {
        return createErrorResponse(res, 400, MessageEnum.NO_SUBSCRIPTION_FOUND)
      }
      const activeStaffMembers = await prisma.staff_Member.count({
        where: {
          userId: req.user.id,
          status: 1
        }
      })

      const sub_status = planDetail.sub_status;
      const max_staff_members = planDetail.plan.maxStaffUsers;

      if (activeStaffMembers >= max_staff_members && planDetail.trial_end_date !== null) {
        return createErrorResponse(res, 400, MessageEnum.NOT_ALLOWED_TRAIL)
      }
      if (activeStaffMembers >= max_staff_members && max_staff_members == 5) {
        return createErrorResponse(res, 400, MessageEnum.NOT_ALLOWED_SUB)
      }
      if (activeStaffMembers >= max_staff_members && max_staff_members == 1) {
        return createErrorResponse(res, 400, MessageEnum.NOT_ALLOWED_Plan)
      }
    }

    // Save the user with the hashed password using Prisma
    const updatedStaffMember = await prisma.staff_Member.update({
      where: {
        id: parseInt(id)
      },
      data: {
        password: hashedPassword,
        showPassword: showPassword,
        full_name: name ? name : staffMember.full_name,
        role: role ? role : staffMember.role,
        phone_no: phone_no ? phone_no : staffMember.phone_no,
        home_address: home_address ? home_address : staffMember.home_address,
        status: status != null && status != undefined ? parseInt(status) : staffMember.status,
        hourly_rate: hourly_rate ? parseFloat(hourly_rate) : staffMember.hourly_rate
      },
    });

    const taskSummary = await prisma.task.groupBy({
      by: ['status'],
      where: {
        assignStaffId: updatedStaffMember.id
      },
      _count: {
        _all: true
      }
    });

    const totalTasks = taskSummary.reduce((acc, item) => acc + item._count._all, 0);
    const completedTasks = taskSummary.find((item) => item.status === 1)?._count._all || 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return createSuccessResponse(res, 200, true, MessageEnum.STAFF_MEMBER_EDITED, {
      id: updatedStaffMember.id,
      full_name: updatedStaffMember.full_name,
      role: updatedStaffMember.role,
      email: updatedStaffMember.email,
      phone_no: updatedStaffMember.phone_no,
      home_address: updatedStaffMember.home_address,
      hourly_rate: updatedStaffMember.hourly_rate,
      status: updatedStaffMember.status,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      completion_rate: completionRate,
    });

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);

  }
}

export async function getStaffMemberById(req, res) {

  try {

    const getBoatStatus = (boat) =>
      boat?.DockBooking?.length
        ? "assigned"
        : "unassigned";

    const { id } = req.params;

    const staffId = parseInt(id);

    if (!staffId || Number.isNaN(staffId)) {

      return createErrorResponse(
        res,
        400,
        "Valid technician id is required"
      );
    }

    const staff =
      await prisma.staff_Member.findFirst({

        where: {

          id: staffId,

          userId: req.user.id
        },

        include: {

          Task: {

            include: {

              boat: {

                select: {
                  id: true,
                  name: true,
                  rego: true,
                  make: true,
                  model: true,
                  boat_type: true,
                  avatar_url: true,
                  owners_name: true,
                  DockBooking: {
                    select: {
                      id: true
                    }
                  }
                }
              },

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

    if (!staff) {

      return createErrorResponse(
        res,
        404,
        MessageEnum.STAFF_MEMBER_NOT_FOUND
      );
    }

    // =====================================
    // BASIC SUMMARY
    // =====================================

    const totalTasks =
      staff.Task.length;

    const completedTasks =
      staff.Task.filter(
        (task) => task.status === 1
      ).length;

    const pendingTasks =
      staff.Task.filter(
        (task) => task.status === 0
      ).length;

    const inProgressTasks =
      staff.Task.filter(
        (task) => task.status === 2
      ).length;

    const overdueTasks =
      staff.Task.filter((task) => {

        return (

          task.status !== 1 &&

          new Date(task.date_scheduled_to)
          < new Date()

        );

      }).length;

    const completionRate =
      totalTasks > 0
        ? Math.round(
          (
            completedTasks / totalTasks
          ) * 100
        )
        : 0;

    // =====================================
    // PERCENTAGES
    // =====================================

    const completedPercentage =
      totalTasks > 0
        ? Math.round(
          (
            completedTasks / totalTasks
          ) * 100
        )
        : 0;

    const pendingPercentage =
      totalTasks > 0
        ? Math.round(
          (
            pendingTasks / totalTasks
          ) * 100
        )
        : 0;

    const inProgressPercentage =
      totalTasks > 0
        ? Math.round(
          (
            inProgressTasks / totalTasks
          ) * 100
        )
        : 0;

    const overduePercentage =
      totalTasks > 0
        ? Math.round(
          (
            overdueTasks / totalTasks
          ) * 100
        )
        : 0;

    // =====================================
    // PERFORMANCE STATUS
    // =====================================

    const earlyCompletedTasks =
      staff.Task.filter(
        (task) =>
          task.performanceStatus === "EARLY"
      ).length;

    const onTimeTasks =
      staff.Task.filter(
        (task) =>
          task.performanceStatus === "ON_TIME"
      ).length;

    const lateTasks =
      staff.Task.filter(
        (task) =>
          task.performanceStatus === "LATE"
      ).length;

    // =====================================
    // EFFICIENCY
    // =====================================

    const excellentTasks =
      staff.Task.filter(
        (task) =>
          task.taskEfficiency === "EXCELLENT"
      ).length;

    const goodTasks =
      staff.Task.filter(
        (task) =>
          task.taskEfficiency === "GOOD"
      ).length;

    const averageTasks =
      staff.Task.filter(
        (task) =>
          task.taskEfficiency === "AVERAGE"
      ).length;

    const poorTasks =
      staff.Task.filter(
        (task) =>
          task.taskEfficiency === "POOR"
      ).length;

    // =====================================
    // ACTIVITY METRICS
    // =====================================

    const totalPhotosUploaded =
      staff.Task.reduce(

        (acc, task) =>

          acc +
          (
            task.TaskPhoto?.length || 0
          ),

        0
      );

    const totalServicesCompleted =
      staff.Task.reduce(

        (acc, task) =>

          acc +
          (
            task.TaskServices?.length || 0
          ),

        0
      );

    const totalMaterialsUsed =
      staff.Task.reduce((acc, task) => {

        const materialCount =

          task.JobServiceSheet?.reduce(

            (sum, sheet) =>

              sum +
              (
                sheet.Material?.length || 0
              ),

            0

          ) || 0;

        return acc + materialCount;

      }, 0);

    const totalWorkingHours =
      staff.Task.reduce(

        (acc, task) =>

          acc +
          (
            (
              task.total_active_minutes || 0
            ) / 60
          ),

        0
      );

    const avgJobCompletionHours =

      totalTasks > 0

        ? Number(
          (
            totalWorkingHours / totalTasks
          ).toFixed(2)
        )

        : 0;

    // =====================================
    // UNIQUE BOATS WORKED ON
    // =====================================

    const uniqueBoatsMap =
      new Map();

    staff.Task.forEach((task) => {

      if (task.boat?.id) {

        uniqueBoatsMap.set(

          task.boat.id,

          {

            boat_id:
              task.boat.id,

            boat_name:
              task.boat.name,

            boat_rego:
              task.boat.rego,

            boat_make:
              task.boat.make,

            boat_model:
              task.boat.model,

            boat_type:
              task.boat.boat_type,

            boat_owner:
              task.boat.owners_name,

            boat_image:
              task.boat.avatar_url,

            boat_status:
              getBoatStatus(task.boat),

            total_tasks:
              staff.Task.filter(
                (t) =>
                  t.boat?.id === task.boat.id
              ).length,

            completed_tasks:
              staff.Task.filter(
                (t) =>
                  t.boat?.id === task.boat.id &&
                  t.status === 1
              ).length,
          }
        );
      }
    });

    const boatsWorkedOn =
      Array.from(
        uniqueBoatsMap.values()
      );

    // =====================================
    // JOB HISTORY
    // =====================================

    const jobHistory =
      staff.Task.map((task, index) => ({

        sr_no:
          index + 1,

        task_id:
          task.id,

        job_name:
          task.description ||
          `Task #${task.id}`,

        boat_name:
          task.boat?.name || null,

        boat_rego:
          task.boat?.rego || null,

        boat_status:
          getBoatStatus(task.boat),

        date_scheduled_from:
          task.date_scheduled_from,

        date_scheduled_to:
          task.date_scheduled_to,

        completed_at:
          task.completed_at,

        status:

          task.status === 1
            ? "Completed"

            : task.status === 2
              ? "In Progress"

              : "Pending",

        performance_status:
          task.performanceStatus,

        task_efficiency:
          task.taskEfficiency,

        completion_delay_minutes:
          task.completionDelayMinutes,

        total_active_minutes:
          task.total_active_minutes || 0,

        uploaded_photos:
          task.TaskPhoto?.length || 0,

        services_completed:
          task.TaskServices?.length || 0,
      }));

    // =====================================
    // FINAL RESPONSE
    // =====================================

    const technicianDetails = {

      id: staff.id,

      full_name:
        staff.full_name,

      role:
        staff.role,

      profile_image:
        null,

      email:
        staff.email,

      phone_no:
        staff.phone_no,

      home_address:
        staff.home_address,

      hourly_rate:
        staff.hourly_rate,

      status:
        staff.status,

      summary: {

        total_tasks:
          totalTasks,

        completed_tasks:
          completedTasks,

        in_progress_tasks:
          inProgressTasks,

        completion_rate:
          completionRate
      },

      performance_metrics: {

        early_completed_tasks:
          earlyCompletedTasks,

        on_time_tasks:
          onTimeTasks,

        late_tasks:
          lateTasks,

        punctuality_score:

          totalTasks > 0

            ? Math.round(

              (
                (
                  earlyCompletedTasks +
                  onTimeTasks
                ) / totalTasks
              ) * 100

            )

            : 0,

        efficiency_breakdown: {

          excellent_tasks:
            excellentTasks,

          good_tasks:
            goodTasks,

          average_tasks:
            averageTasks,

          poor_tasks:
            poorTasks,
        },

        total_photos_uploaded:
          totalPhotosUploaded,

        total_services_completed:
          totalServicesCompleted,

        total_materials_used:
          totalMaterialsUsed,

        total_working_hours:

          Number(
            totalWorkingHours.toFixed(2)
          ),

        average_job_completion_hours:
          avgJobCompletionHours,
      },

      technician_activity: {

        performance_summary: {

          total_jobs:
            totalTasks,

          completed_jobs:
            completedTasks,

          pending_jobs:
            pendingTasks,

          in_progress_jobs:
            inProgressTasks,

          overdue_jobs:
            overdueTasks,

          completion_rate:
            completionRate,
        },

        jobs_overview: {

          total: {

            count:
              totalTasks,

            percentage:
              100
          },

          completed: {

            count:
              completedTasks,

            percentage:
              completedPercentage
          },

          pending: {

            count:
              pendingTasks,

            percentage:
              pendingPercentage
          },

          in_progress: {

            count:
              inProgressTasks,

            percentage:
              inProgressPercentage
          },

          overdue: {

            count:
              overdueTasks,

            percentage:
              overduePercentage
          }
        },

        punctuality_metrics: {

          early_completed_tasks:
            earlyCompletedTasks,

          on_time_tasks:
            onTimeTasks,

          late_tasks:
            lateTasks,

          punctuality_score:

            totalTasks > 0

              ? Math.round(

                (
                  (
                    earlyCompletedTasks +
                    onTimeTasks
                  ) / totalTasks
                ) * 100

              )

              : 0,
        },

        efficiency_metrics: {

          excellent_tasks:
            excellentTasks,

          good_tasks:
            goodTasks,

          average_tasks:
            averageTasks,

          poor_tasks:
            poorTasks,
        },

        productivity_metrics: {

          total_photos_uploaded:
            totalPhotosUploaded,

          total_services_completed:
            totalServicesCompleted,

          total_materials_used:
            totalMaterialsUsed,

          total_working_hours:

            Number(
              totalWorkingHours.toFixed(2)
            ),

          average_job_completion_hours:
            avgJobCompletionHours,
        }
      },

      boats_worked_on:
        boatsWorkedOn,

      job_history:
        jobHistory
    };

    return createSuccessResponse(

      res,

      200,

      true,

      MessageEnum.STAFF_MEMBER_DATA,

      technicianDetails
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

export async function deleteStaffMemberById(req, res) {
  try {
    const { id } = req.params;
    const staffId = parseInt(id);

    if (!staffId || Number.isNaN(staffId)) {
      return createErrorResponse(res, 400, "Valid technician id is required");
    }

    const staff = await prisma.staff_Member.findFirst({
      where: {
        id: staffId,
        userId: req.user.id,
      },
      include: {
        Task: {
          select: { id: true }
        },
        JobServiceSheet: {
          select: { id: true }
        },
        TaskPhoto: {
          select: { id: true }
        }
      }
    });

    if (!staff) {
      return createErrorResponse(res, 404, MessageEnum.STAFF_MEMBER_NOT_FOUND);
    }

    // Check if staff has associated records
    const hasTasks = staff.Task.length > 0;
    const hasJobSheets = staff.JobServiceSheet.length > 0;
    const hasTaskPhotos = staff.TaskPhoto.length > 0;

    if (hasTasks || hasJobSheets || hasTaskPhotos) {
      return createErrorResponse(res, 400, "Cannot delete technician with associated tasks, job sheets, or photos. Please reassign or complete these records first.");
    }

    // Actually delete the staff member
    await prisma.staff_Member.delete({
      where: {
        id: staffId,
      },
    });

    return createSuccessResponse(res, 200, true, "Staff member deleted successfully.");
  } catch (error) {
    console.log(error);
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
      const staffMember = await prisma.staff_Member.findUnique({
        where: { email },
      });

      if (!staffMember || !(await argon2.verify(staffMember.password, password))) {
        return res.status(400).json({
          success: false,
          message: "Invalid login credentials",
          status: 400,
        });
      }


      if (staffMember.status === 0) {
        return res.status(400).json({
          message: "Your account has been blocked by the administrator. Please contact support for further assistance.",
          status: 400,
          success: false,
        });
      }

      if (staffMember.system_deactivation_status === 0) {
        return res.status(400).json({
          message: "Your account has been blocked by the Service Hub. Please contact support for further assistance.",
          status: 400,
          success: false,
        });
      }

      const staffData = await prisma.staff_Member.findUnique({
        where: { email },
      });

      const token = jwt.sign({ staffId: staffData.id }, secretKey, { expiresIn: '24w' });
      return res.json({
        status: 200,
        success: true,
        message: "Login successful!",
        data: {
          token, staffData
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

export async function getAllStaffMembers(req, res) {

  try {

    const {
      search,
      status
    } = req.query;

    const where = {

      userId: req.user.id
    };

    // =====================================
    // SEARCH FILTER
    // =====================================

    if (search) {

      where.OR = [

        {
          full_name: {
            contains: search
          }
        },

        {
          email: {
            contains: search
          }
        },

        {
          role: {
            contains: search
          }
        }
      ];
    }

    // =====================================
    // STATUS FILTER
    // =====================================

    if (
      status !== undefined &&
      status !== ""
    ) {

      where.status =
        parseInt(status);
    }

    const staffMembers =
      await prisma.staff_Member.findMany({

        where,

        include: {

          Task: {

            include: {

              TaskPhoto: true,

              TaskServices: true,

              JobServiceSheet: {

                include: {
                  Material: true
                }
              }
            }
          }
        },

        orderBy: {
          id: "desc"
        }
      });

    // =====================================
    // FINAL RESPONSE
    // =====================================

    const formattedData =
      staffMembers.map((staff, index) => {

        // ================================
        // TASK COUNTS
        // ================================

        const totalTasks =
          staff.Task.length;

        const completedTasks =
          staff.Task.filter(
            (task) => task.status === 1
          ).length;

        const pendingTasks =
          staff.Task.filter(
            (task) => task.status === 0
          ).length;

        const inProgressTasks =
          staff.Task.filter(
            (task) => task.status === 2
          ).length;

        const overdueTasks =
          staff.Task.filter((task) => {

            return (

              task.status !== 1 &&

              new Date(
                task.date_scheduled_to
              ) < new Date()

            );

          }).length;

        // ================================
        // COMPLETION RATE
        // ================================

        const completionRate =

          totalTasks > 0

            ? Math.round(
              (
                completedTasks /
                totalTasks
              ) * 100
            )

            : 0;

        // ================================
        // PERFORMANCE
        // ================================

        const earlyCompletedTasks =
          staff.Task.filter(
            (task) =>
              task.performanceStatus === "EARLY"
          ).length;

        const onTimeTasks =
          staff.Task.filter(
            (task) =>
              task.performanceStatus === "ON_TIME"
          ).length;

        const lateTasks =
          staff.Task.filter(
            (task) =>
              task.performanceStatus === "LATE"
          ).length;

        // ================================
        // EFFICIENCY
        // ================================

        const excellentTasks =
          staff.Task.filter(
            (task) =>
              task.taskEfficiency === "EXCELLENT"
          ).length;

        const goodTasks =
          staff.Task.filter(
            (task) =>
              task.taskEfficiency === "GOOD"
          ).length;

        const averageTasks =
          staff.Task.filter(
            (task) =>
              task.taskEfficiency === "AVERAGE"
          ).length;

        const poorTasks =
          staff.Task.filter(
            (task) =>
              task.taskEfficiency === "POOR"
          ).length;

        // ================================
        // PRODUCTIVITY
        // ================================

        const totalPhotosUploaded =
          staff.Task.reduce(

            (acc, task) =>

              acc +
              (
                task.TaskPhoto?.length || 0
              ),

            0
          );

        const totalServicesCompleted =
          staff.Task.reduce(

            (acc, task) =>

              acc +
              (
                task.TaskServices?.length || 0
              ),

            0
          );

        const totalMaterialsUsed =
          staff.Task.reduce((acc, task) => {

            const materialCount =

              task.JobServiceSheet?.reduce(

                (sum, sheet) =>

                  sum +
                  (
                    sheet.Material?.length || 0
                  ),

                0

              ) || 0;

            return acc + materialCount;

          }, 0);

        const totalWorkingHours =
          staff.Task.reduce(

            (acc, task) =>

              acc +
              (
                (
                  task.total_active_minutes || 0
                ) / 60
              ),

            0
          );

        const avgJobCompletionHours =

          totalTasks > 0

            ? Number(
              (
                totalWorkingHours /
                totalTasks
              ).toFixed(2)
            )

            : 0;

        // ================================
        // RETURN OBJECT
        // ================================

        return {

          sr_no:
            index + 1,

          id:
            staff.id,

          full_name:
            staff.full_name,

          role:
            staff.role,

          email:
            staff.email,

          phone_no:
            staff.phone_no,

          home_address:
            staff.home_address,

          hourly_rate:
            staff.hourly_rate,

          status:
            staff.status,

          createdAt:
            staff.createdAt,

          summary: {

            total_tasks:
              totalTasks,

            completed_tasks:
              completedTasks,

            pending_tasks:
              pendingTasks,

            in_progress_tasks:
              inProgressTasks,

            overdue_tasks:
              overdueTasks,

            completion_rate:
              completionRate,
          },

          performance_metrics: {

            early_completed_tasks:
              earlyCompletedTasks,

            on_time_tasks:
              onTimeTasks,

            late_tasks:
              lateTasks,

            punctuality_score:

              totalTasks > 0

                ? Math.round(

                  (
                    (
                      earlyCompletedTasks +
                      onTimeTasks
                    ) / totalTasks
                  ) * 100

                )

                : 0,
          },

          efficiency_metrics: {

            excellent_tasks:
              excellentTasks,

            good_tasks:
              goodTasks,

            average_tasks:
              averageTasks,

            poor_tasks:
              poorTasks,
          },

          productivity_metrics: {

            total_photos_uploaded:
              totalPhotosUploaded,

            total_services_completed:
              totalServicesCompleted,

            total_materials_used:
              totalMaterialsUsed,

            total_working_hours:

              Number(
                totalWorkingHours.toFixed(2)
              ),

            average_job_completion_hours:
              avgJobCompletionHours,
          }
        };

      });

    return createSuccessResponse(

      res,

      200,

      true,

      MessageEnum.STAFF_MEMBER_FETCHED,

      formattedData
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

export async function toggleStaffStatus(req, res) {
  try {
    const { id } = req.params;

    const staffMember = await prisma.staff_Member.findUnique({ where: { id: parseInt(id), userId: req.user.id } });

    if (!staffMember) {
      return createErrorResponse(res, 404, MessageEnum.STAFF_MEMBER_NOT_FOUND);
    }

    const newStatus = staffMember.status === 1 ? 0 : 1;

    const staffMemberUpdated = await prisma.staff_Member.update({
      where: { id: parseInt(id) },
      data: { status: newStatus },
    });
    return res.status(200).json({
      success: true,
      message: `Staff Member ${newStatus === 1 ? 'Activated' : 'Deactivated'} Successfully`,
      status: 200,
      data: {}
    });

  } catch (error) {
    console.log('error', error)
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export async function activeStaffMembers(req, res) {
  try {

    const staffMembers = await prisma.staff_Member.findMany({
      where: {
        userId: req.user.id,
        status: 1
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return createSuccessResponse(res, 200, true, MessageEnum.STAFF_MEMBER_DATA, staffMembers);

  } catch (error) {
    console.log(error);
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
      const admin = await prisma.staff_Member.findUnique({
        where: {
          email: email,
        }
      })
      if (admin) {
        const genToken = randomStringAsBase64Url(20);
        await prisma.staff_Member.update({
          where: {
            email: email
          },
          data: {
            token: genToken
          }
        })

        const adminToken = (await prisma.staff_Member.findUnique({
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
            href_url: `${baseurl}/staff/verifyPassword/${adminToken}`,
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

export async function verifyPassword(req, res) {
  try {

    const id = req.params.token;
    console.log('id', id)

    console.log(id)

    if (!id) {
      return res.status(400).send("Invalid link");
    }
    else {
      const staffMember = await prisma.staff_Member.findFirst({
        where: {
          token: id
        }
      })
      const token = staffMember.token;
      if (token) {
        console.log("here is the vertoken");
        localStorage.setItem('vertoken', JSON.stringify(token));
        res.render(path.join(__dirname, '../view/', 'forgetPasswordStaff.ejs'), { msg: "" });
      }
      else {
        res.render(path.join(__dirname, '../view/', 'forgetPasswordStaff.ejs'), { msg: "This User is not Registered" });

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
      res.render(path.join(__dirname, '../view/', 'forgetPasswordStaff.ejs'), {
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        msg: message
      });

    }
    else {
      if (password == confirm_password) {
        const staffMember = await prisma.staff_Member.findFirst({
          where: {
            token: token
          }
        });
        if (staffMember) {
          const hashedPassword = await argon2.hash(password);
          await prisma.staff_Member.update({
            where: {
              id: staffMember.id
            },
            data: {
              password: hashedPassword,
              showPassword: password
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

export async function getTodayTasks(req, res) {
  try {
    // const { assignStaffId } = req.params;
    // const  assignStaffId = req.user.id;
    // console.log('assignStaffId', assignStaffId);

    const timeZone = 'Asia/Kolkata';
    const { startOfToday, endOfToday } = getDateRanges(timeZone);

    console.log("startOfToday:", startOfToday.format());
    console.log('startOfToday', startOfToday)
    console.log("endOfToday:", endOfToday.format());


    const tasks = await prisma.task.findMany({
      where: {
        assignStaffId: req.user.id,
        date_scheduled_to: {
          gte: startOfToday.format(),
          lt: endOfToday.format()
        },
        status: {
          not: 1
        },

      },
      include: {
        boat: true,
        staff: true,
      },
      orderBy: {
        id: 'desc'
      }
    });
    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, tasks);

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


    const tasks = await prisma.task.findMany({
      where: {
        assignStaffId: req.user.id,
        date_scheduled_to: {
          gte: startOfTomorrow.format(),
          lt: endOfTomorrow.format()
        },
        status: {
          not: 1
        }
      },
      include: {
        boat: true,
        staff: true,
      },
      orderBy: {
        id: 'desc'
      }
    });
    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, tasks);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

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

      const message =
        error.details.map((i) => i.message).join(", ");

      return res.status(400).json({
        message,
        missingParams: error.details[0].message,
        status: 400,
        success: false,
      });
    }

    const task = await prisma.task.findFirst({

      where: {
        id: parseInt(taskId),
        assignStaffId: req.user.id
      },

    });

    if (!task) {

      return createErrorResponse(
        res,
        404,
        MessageEnum.TASK_NOT_FOUND
      );
    }

    if (req.files && req.files.length > 0) {

      const images = req.files.map((file) => ({
        url: file.filename,
        taskId: parseInt(taskId),
        staffId: req.user.id
      }));

      // =====================================
      // PERFORMANCE CALCULATION
      // =====================================

      const scheduledEndDate =
        new Date(task.date_scheduled_to);

      const completedDate =
        new Date();

      // =====================================
      // TIME DIFFERENCE
      // =====================================

      const differenceInMs =
        completedDate.getTime() -
        scheduledEndDate.getTime();

      const completionDelayMinutes =
        Math.round(
          differenceInMs / (1000 * 60)
        );

      // =====================================
      // PERFORMANCE STATUS
      // =====================================

      let performanceStatus =
        "ON_TIME";

      // EARLY
      if (completionDelayMinutes < -30) {

        performanceStatus =
          "EARLY";
      }

      // LATE
      else if (
        completionDelayMinutes > 30
      ) {

        performanceStatus =
          "LATE";
      }

      // =====================================
      // TASK EFFICIENCY
      // =====================================

      let taskEfficiency =
        "AVERAGE";

      // Excellent
      if (
        completionDelayMinutes <= -60
      ) {

        taskEfficiency =
          "EXCELLENT";
      }

      // Good
      else if (
        completionDelayMinutes > -60 &&
        completionDelayMinutes <= 30
      ) {

        taskEfficiency =
          "GOOD";
      }

      // Average
      else if (
        completionDelayMinutes > 30 &&
        completionDelayMinutes <= 120
      ) {

        taskEfficiency =
          "AVERAGE";
      }

      // Poor
      else {

        taskEfficiency =
          "POOR";
      }

      // =====================================
      // UPDATE TASK
      // =====================================

      await prisma.task.update({

        where: {
          id: parseInt(taskId)
        },

        data: {

          taskInfo,

          supplierNotes,

          futureWatchList,

          recommendedDueDate:
            recommendedDueDate
              ? new Date(recommendedDueDate)
              : null,

          status: 1,

          completed_at:
            completedDate,

          performanceStatus,

          taskEfficiency,

          completionDelayMinutes,

          timer_status:
            "COMPLETED",
        },
      });

      // =====================================
      // SAVE TASK PHOTOS
      // =====================================

      await prisma.taskPhoto.createMany({
        data: images,
      });

      // =====================================
      // GET USER
      // =====================================

      const user = await prisma.user.findUnique({

        where: {
          id: task.userId
        }

      });

      // =====================================
      // CREATE NOTIFICATION
      // =====================================

      await createNotification({

        toUserId:
          user.id,

        byStaffId:
          req.user.id,

        taskId:
          task.id,

        data: {
          performanceStatus,
          taskEfficiency,
          completionDelayMinutes
        },

        type:
          'task',

        content:
          `${req.user.full_name} completed a Task`
      });

      // =====================================
      // PUSH NOTIFICATION
      // =====================================

      await sendNotificationRelateToTask({

        token:
          user.fcm_token,

        toUserId:
          user.id,

        body:
          `${req.user.full_name} completed a Task`,

        taskId:
          task.id

      });

      return createSuccessResponse(
        res,
        200,
        true,
        MessageEnum.TASK_COMPLETED,
      );

    } else {

      return createErrorResponse(
        res,
        400,
        'No images uploaded'
      );
    }

  } catch (error) {

    console.log("error", error);

    return createErrorResponse(
      res,
      500,
      MessageEnum.INTERNAL_SERVER_ERROR
    );
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
    materials,

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
        assignStaffId: req.user.id
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

    const jobServiceSheet = await prisma.jobServiceSheet.create({
      data: {
        date: new Date(date),
        taskId: parseInt(taskId),
        staffId: req.user.id,
        jobNumber,
        personAttending,
        customerName,
        mobile,
        workToBeCarriedOut,
        workCarriedOut,
        cdsSignature,
      },
    });

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

    await prisma.task.update({
      where: {
        id: parseInt(taskId)
      },
      data: {
        status: 2
      }
    })

    return createSuccessResponse(res, 200, true, MessageEnum.JOB_SERVICE_SHEET, jobServiceSheet);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export async function getCompletedTasks(req, res) {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        assignStaffId: req.user.id,
        status: 1
      },
      include: {
        boat: true,
        staff: true,
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

export async function getAllMytasks(req, res) {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        assignStaffId: req.user.id,
      },
      include: {
        boat: true,
        staff: true,
      },
      orderBy: [
        { date_scheduled_from: 'desc' },
        { id: 'desc' },
      ],
    });

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, tasks);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export async function getMyProfile(req, res) {
  try {

    const staff = await prisma.staff_Member.findUnique({
      where: {
        id: req.user.id
      }
    })
    return createSuccessResponse(res, 200, true, MessageEnum.STAFF_MEMBER_DATA, staff);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
}

// export const updateTaskTimer = async (req, res) => {
//   const schema = Joi.object({
//     taskId: Joi.number().required(),
//     type: Joi.string().valid("START", "PAUSE", "RESUME", "COMPLETE").required()
//   });
//   console.log("here????????")

//   const { error } = schema.validate(req.body);
//   if (error) {
//     const message = error.details.map((i) => i.message).join(", ");
//     return res.status(400).json({
//       message: message,
//       missingParams: error.details[0].message,
//       status: 400,
//       success: false,
//     });
//   }
//   const { taskId, type } = req.body;

//   try {
//     const task = await prisma.task.findUnique({
//       where: { id: taskId }
//     });

//     if (!task) return createErrorResponse(res, 404, "Task not found");

//     let updateData = {};
//     const now = new Date();

//     switch (type) {
//       case "START":
//         if (task.timer_status === "STARTED" || task.timer_status === "COMPLETED") {
//           return createErrorResponse(res, 400, MessageEnum.JOB_ALREADY_STARTED);
//         }
//         updateData = {
//           job_start_time: now,
//           timer_status: "STARTED",
//           paused_durations: [] // Initialize pause array
//         };
//         break;

//       case "PAUSE":
//         if (task.timer_status !== "STARTED") {
//           return createErrorResponse(res, 400, MessageEnum.JOB_PAUSED);
//         }
//         const pauseList = task.paused_durations || [];
//         pauseList.push({ start: now, end: null });
//         updateData = {
//           paused_durations: pauseList,
//           timer_status: "PAUSED"
//         };
//         break;

//       case "RESUME":
//         if (task.timer_status !== "PAUSED") {
//           return createErrorResponse(res, 400, MessageEnum.JOB_RESUME);
//         }
//         const resumes = task.paused_durations || [];
//         const last = resumes[resumes.length - 1];
//         if (last && !last.end) {
//           last.end = now;
//         }
//         updateData = {
//           paused_durations: resumes,
//           timer_status: "STARTED"
//         };
//         break;

//       case "COMPLETE":
//         if (!task.job_start_time) {
//           return createErrorResponse(res, 400, MessageEnum.JOB_COMPLETE);
//         }

//         let pausedMs = 0;
//         if (task.paused_durations) {
//           for (const p of task.paused_durations) {
//             if (p.start && p.end) {
//               pausedMs += new Date(p.end) - new Date(p.start);
//             }
//           }
//         }

//         const jobStart = new Date(task.job_start_time);
//         const jobEnd = now;
//         const totalMs = jobEnd - jobStart;
//         const effectiveMs = totalMs - pausedMs;
//         const totalMinutes = Math.floor(effectiveMs / (1000 * 60));

//         updateData = {
//           job_end_time: jobEnd,
//           total_active_minutes: totalMinutes,
//           timer_status: "COMPLETED"
//         };
//         break;
//     }

//     // Update Task
//     await prisma.task.update({
//       where: { id: parseInt(taskId) },
//       data: updateData
//     });

//     // Optional: log the timer action
//     // await prisma.jobTimerLog.create({
//     //   data: {
//     //     taskId,
//     //     type
//     //   }
//     // });

//     return createSuccessResponse(res, 200, true, `Task timer ${type} logged`, updateData);

//   } catch (err) {
//     console.error(err);
//     return createErrorResponse(res, 500, "Internal Server Error");
//   }
// };

export const updateTaskTimer = async (req, res) => {
  const schema = Joi.object({
    taskId: Joi.number().required(),
    type: Joi.string().valid("START", "PAUSE", "RESUME", "COMPLETE").required()
  });
  console.log("here????????")

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
  const { taskId, type } = req.body;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) return createErrorResponse(res, 404, "Task not found");

    let updateData = {};
    const now = new Date();

    switch (type) {
      case "START":
        if (task.timer_status === "STARTED" || task.timer_status === "COMPLETED") {
          return createErrorResponse(res, 400, MessageEnum.JOB_ALREADY_STARTED);
        }
        updateData = {
          job_start_time: now,
          timer_status: "STARTED",
          paused_durations: [] // Initialize pause array
        };
        break;

      case "PAUSE":
        if (task.timer_status !== "STARTED") {
          return createErrorResponse(res, 400, MessageEnum.JOB_PAUSED);
        }
        const pauseList = task.paused_durations || [];
        pauseList.push({ start: now, end: null });
        updateData = {
          paused_durations: pauseList,
          timer_status: "PAUSED"
        };
        break;

      case "RESUME":
        if (task.timer_status !== "PAUSED") {
          return createErrorResponse(res, 400, MessageEnum.JOB_RESUME);
        }
        const resumes = task.paused_durations || [];
        const last = resumes[resumes.length - 1];
        if (last && !last.end) {
          last.end = now;
        }
        updateData = {
          paused_durations: resumes,
          timer_status: "STARTED"
        };
        break;

      case "COMPLETE":
        if (!task.job_start_time) {
          console.log("task before", task.job_start_time)
          const newUpdatedData = {
            job_start_time: now,
            timer_status: "STARTED",
            paused_durations: [] // Initialize pause array
          };

          await prisma.task.update({
            where: { id: parseInt(taskId) },
            data: newUpdatedData
          });

          await prisma.jobTimerLog.create({
            data: {
              taskId,
              type: "START"
            }
          });


          // return createErrorResponse(res, 400, MessageEnum.JOB_COMPLETE);
        }

        const newtask = await prisma.task.findUnique({
          where: { id: taskId }
        });

        console.log("task after", newtask.job_start_time)



        let pausedMs = 0;
        if (newtask.paused_durations) {
          for (const p of newtask.paused_durations) {
            if (p.start && p.end) {
              pausedMs += new Date(p.end) - new Date(p.start);
            }
          }
        }
        console.log("pausedMs", pausedMs)
        const jobStart = new Date(newtask.job_start_time);

        const jobEnd = new Date(now);
        console.log("jobStart", jobStart)
        console.log("jobEnd", jobEnd)
        const totalMs = jobEnd - jobStart;
        console.log("totalMs", totalMs)
        const effectiveMs = totalMs - pausedMs;
        console.log("effectiveMs", effectiveMs)
        const totalMinutes = Math.floor(effectiveMs / (1000 * 60));

        console.log("totalMinutes", totalMinutes)

        updateData = {
          job_end_time: jobEnd,
          total_active_minutes: totalMinutes,
          timer_status: "COMPLETED"
        };
        break;
    }

    // Update Task
    await prisma.task.update({
      where: { id: parseInt(taskId) },
      data: updateData
    });

    // Optional: log the timer action
    await prisma.jobTimerLog.create({
      data: {
        taskId,
        type
      }
    });

    return createSuccessResponse(res, 200, true, `Task timer ${type} logged`, updateData);

  } catch (err) {
    console.error(err);
    return createErrorResponse(res, 500, "Internal Server Error");
  }
};

export async function getTaskById(req, res) {
  try {
    const { taskId } = req.body;
    const schema = Joi.object({
      taskId: Joi.number().required(),
    });
    console.log("here????????")

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
      where: {
        assignStaffId: req.user.id,
        id: parseInt(taskId)
      },
      include: {
        boat: true,
        staff: true,
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, task);

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};
