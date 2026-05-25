import { PrismaClient } from '@prisma/client';
import Joi from "joi";
import { MessageEnum } from "../config/message.js";
import { addMonths, isToday, isBefore } from 'date-fns';
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
const prisma = new PrismaClient();

export const createQuickLeads = async (req, res) => {
  const {
    client_name, client_contact_number,notes
  } = req.body;

  const schema = Joi.object({

    client_name: Joi.string().required(),
    client_contact_number: Joi.string().required(),
    notes: Joi.string().optional().allow(''),
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
  const isQuickLead = await prisma.quickLeads.findFirst({
    where: {
      client_contact_number: client_contact_number
    }
  })
  if (isQuickLead) {
    return createErrorResponse(res, 404, MessageEnum.QUICKLEAD_ALREADY_PRESENT);
  }
  try {
    const newQuickLeads = await prisma.quickLeads.create({
      data: {
        client_name,
        client_contact_number,
        userId: req.user.id,
        notes:notes
      }
    });

    return createSuccessResponse(res, 201, true, MessageEnum.QUICK_LEADS_CREATED, newQuickLeads);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const getAllQuickLeads = async (req, res) => {
  try {
    const { show_actioned} = req.query;
    const filterQuery = {
      userId: req.user.id,
      ...(show_actioned && {
        status: 2,
      }),
      
    };
    const quickLeads = await prisma.quickLeads.findMany({
      where: filterQuery,
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return createSuccessResponse(res, 200, true, MessageEnum.QUICK_LEAD_DATA, quickLeads);
  } catch (error) {
    console.error(error);

    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};


export const updateQuickLeads = async (req, res) => {
  const { client_name, client_contact_number, status, id ,notes} = req.body;

  const schema = Joi.object({
    client_name: Joi.string().optional(),
    client_contact_number: Joi.string().optional(),
    id: Joi.number().integer().required(),
    status: Joi.number().integer().optional(),
    notes: Joi.string().optional().allow(''),
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

  const quickLeadExists = await prisma.quickLeads.findUnique({
    where: { id: parseInt(id), userId: req.user.id },
  });

  if (!quickLeadExists) {
    return createErrorResponse(res, 404, MessageEnum.QUICK_LEAD_NOT_FOUND);
  }

  if (client_contact_number) {
    const isLead = await prisma.quickLeads.findFirst({
      where: {
        id: {
          not: parseInt(id)
        },
        client_contact_number: client_contact_number
      }
    })

    if (isLead) {
      return createErrorResponse(res, 404, MessageEnum.QUICKLEAD_ALREADY_PRESENT);
    }
  }


  try {
    const updatedQuickLeads = await prisma.quickLeads.update({
      where: { id: parseInt(id) },
      data: {
        client_name: client_name || quickLeadExists.client_name,
        client_contact_number: client_contact_number || quickLeadExists.client_contact_number,
        status: status != undefined && status !== null ? parseInt(status) : quickLeadExists.status,
        notes:notes
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.QUICK_LEADS_UPDATED, updatedQuickLeads);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const getQuickLeadsRecurring = async (req, res) => {
  const currentDate = new Date();

  try {
    const tasks = await prisma.task.findMany({
      where: {
        isRecurring: 1,
        status: 1,
        contacted_status:{
          not:1
        },
        userId: req.user.id,
        completed_at: { not: null },
      },
      include: {
        boat: true,
        JobServiceSheet:true
      },
      orderBy: {
        completed_at: 'desc'
      }
    });

    const dueTasks = tasks.filter((task) => {
      const nineMonthsAfterCompletion = addMonths(task.completed_at, 9);
      const twelveMonthsAfterCompletion = addMonths(task.completed_at, 12);

      return (
        (isToday(nineMonthsAfterCompletion) || isBefore(nineMonthsAfterCompletion, currentDate)) &&
        isBefore(currentDate, twelveMonthsAfterCompletion)
      );
    });

    return res.status(200).json({
      success: true,
      message: "Due recurring tasks retrieved successfully",
      data: dueTasks,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getQuickLeads = async (req, res) => {
  const { id } = req.params;
  try {
    const quickLeads = await prisma.quickLeads.findUnique({
      where: { id: parseInt(id), userId: req.user.id },
      include: {
        user: true,
      }
    });
    if (!quickLeads) {
      return createErrorResponse(res, 404, MessageEnum.QUICK_LEAD_NOT_FOUND);
    }
    return createSuccessResponse(res, 200, true, MessageEnum.QUICK_LEAD_DATA, quickLeads)
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const deleteQuickLeads = async (req, res) => {
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

    const QuickLead = await prisma.quickLeads.findUnique({
      where: {
        id: parseInt(id)
      }
    })
    if (!QuickLead) {
      return createErrorResponse(res, 400, MessageEnum.QUICK_LEAD_NOT_FOUND, {})
    }

    await prisma.quickLeads.delete({
      where: { id: parseInt(id) }
    });
    return createSuccessResponse(res, 200, true, MessageEnum.QUICK_LEAD_DELETE, {})
  } catch (error) {
    console.log(error)
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR)
  }
};

export const updateRecurringTask = async (req, res) => {
  const { status, id } = req.body;

  const schema = Joi.object({
    id: Joi.number().integer().required(),
    status: Joi.number().integer().required(),
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
    where: { id: parseInt(id), userId: req.user.id },
  });

  if (!task) {
    return createErrorResponse(res, 404, MessageEnum.TASK_NOT_FOUND);
  }



  try {
    await prisma.task.update({
      where: { id: parseInt(id) },
      data: {
        contacted_status: parseInt(status)
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.TASK_STATUS_UPDATED, );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};