import { PrismaClient } from '@prisma/client';
import Joi from "joi";
import { MessageEnum } from "../config/message.js";
import dotenv from 'dotenv';
import {
  LENGTH_CATEGORIES,
  LENGTH_CATEGORY_ERROR_MESSAGE,
  WEIGHT_CATEGORIES,
  WEIGHT_CATEGORY_ERROR_MESSAGE,
  toApiLengthCategory,
  toPrismaLengthCategory
} from "../constants/categoryConstants.js";
dotenv.config();
const baseurl = process.env.BASE_URL;
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
import { getDateRanges } from '../utils/helper.js';
const prisma = new PrismaClient();

function serializeBoatCategories(boat) {
  if (!boat) return boat;

  return {
    ...boat,
    boat_length_category: toApiLengthCategory(boat.boat_length_category),
  };
}

export const createBoat = async (req, res) => {
  const {
    name, owners_name, rego, vin, make, model, engine_no,
    engine_make, engine_model, length, app_date, book_from, book_to, email, phone_no, docking_date, boat_type, isBoathubRego,
    boat_weight_category, boat_length_category
  } = req.body;

  const schema = Joi.object({
    name: Joi.string().required(),
    owners_name: Joi.string().required(),
    rego: Joi.string().required(),
    vin: Joi.string().optional().allow(''),
    make: Joi.string().required(),
    model: Joi.string().required(),
    engine_no: Joi.string().optional().allow(''),
    engine_make: Joi.string().optional().allow(''),
    engine_model: Joi.string().optional().allow(''),
    length: Joi.string(),
    app_date: Joi.date().optional().allow(''),
    book_from: Joi.date().optional().allow(''),
    book_to: Joi.date().optional().allow(''),
    email: Joi.string().email().required(),
    phone_no: Joi.string().required(),
    docking_date: Joi.date().optional().allow(''),
    boat_type: Joi.string().valid('Trailer Boat', 'Yacht', 'Jetski').required(), // Boat type validation
    isBoathubRego: Joi.boolean(),  // MVP1 Ventures
    boat_weight_category: Joi.string().valid(...WEIGHT_CATEGORIES).optional().allow(null, '').messages({
      "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
    }),
    boat_length_category: Joi.string().valid(...LENGTH_CATEGORIES).optional().allow(null, '').messages({
      "any.only": LENGTH_CATEGORY_ERROR_MESSAGE,
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


  let filename;
  if (req.file) {
    const file = req.file;
    filename = file.filename;
  }

  try {
    const newBoat = await prisma.boat.create({
      data: {
        name: (name && (name !== "null")) ? name  : '',
        owners_name: (owners_name && (owners_name !== "null")) ? owners_name  : '',
        avatar_url: req?.file ? req?.file.filename : null,
        userId: req?.user.id,
        rego: (rego && (rego !== "null")) ? rego  : '',
        vin: (vin && (vin !== "null")) ? vin  : '',
        make: (make && (make !== "null")) ? make  : '',
        model: (model && (model !== "null")) ? model  : '',
        engine_no: (engine_no && (engine_no !== "null")) ? engine_no  : '',
        engine_make: (engine_make && (engine_make !== "null")) ? engine_make  : '',
        engine_model: (engine_model && (engine_model !== "null")) ? engine_model : null,
        length: (length && (length !== "null")) ? length  : '',
        app_date: app_date ? new Date(app_date) : null,
        book_from: book_from ? new Date(book_from) : null,
        book_to: book_to ? new Date(book_to) : null,
        email: (email && (email !== "null")) ? email : '',
        phone_no: (phone_no && (phone_no !== "null")) ? phone_no : '',
        boat_type: (boat_type && (boat_type !== "null")) ? boat_type : '',
        docking_date: docking_date ? new Date(docking_date) : null,
        isBoathubRego: isBoathubRego ? true : false,   // MVP1 Ventures
        boat_weight_category: boat_weight_category || null,
        boat_length_category: toPrismaLengthCategory(boat_length_category),
      }
    });

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.BOAT_CREATED,
      serializeBoatCategories(newBoat)
    );
  } catch (error) {
    console.error(error);

    // MVP1 Ventures
    // Handle unique constraint violation for `rego`
    if (error.code === 'P2002' && error.meta?.target?.includes('rego')) {
      return createErrorResponse(res, 400, MessageEnum.DUPLICATE_REGO_MSG);
    }

    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};


export const getAllBoat = async (req, res) => {
  try {
    const { filter, name, date, boat_weight_category, boat_length_category } = req.query; // Extract query parameters
    const querySchema = Joi.object({
      boat_weight_category: Joi.string().valid(...WEIGHT_CATEGORIES).optional().messages({
        "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
      }),
      boat_length_category: Joi.string().valid(...LENGTH_CATEGORIES).optional().messages({
        "any.only": LENGTH_CATEGORY_ERROR_MESSAGE,
      }),
    });
    const { error } = querySchema.validate({
      boat_weight_category,
      boat_length_category,
    });

    if (error) {
      return createErrorResponse(res, 400, error.details[0].message);
    }

    const currentDate = new Date();

    const timeZone = 'Asia/Kolkata'; // e.g., 'America/New_York', 'Asia/Kolkata'

    const { startOfToday, endOfToday, startOfTomorrow } = getDateRanges(timeZone);

    // Logging the results
    console.log("startOfToday:", startOfToday.format()); // Outputs in ISO format
    console.log("endOfToday:", endOfToday.format());     // Outputs in ISO format
    console.log("startOfTomorrow:", startOfTomorrow.format()); // Outputs in ISO format

    // Start of tofay in UTC
    // const startOfToday = new Date(
    //   currentDate.getFullYear(),
    //   currentDate.getMonth(),
    //   currentDate.getDate(),
    //   0, 0, 0 // Midnight
    // );

    // // End of today in local time (23:59:59.999)
    // const endOfToday = new Date(
    //   currentDate.getFullYear(),
    //   currentDate.getMonth(),
    //   currentDate.getDate(),
    //   23, 59, 59, 999 // End of the day
    // );

    // // Start of tomorrow in local time (00:00:00)
    // const startOfTomorrow = new Date(
    //   currentDate.getFullYear(),
    //   currentDate.getMonth(),
    //   currentDate.getDate() + 1,
    //   0, 0, 0 // Midnight of the next day
    // );

    // // Logging the results in local time (for clarity)
    // console.log("startOfToday", startOfToday.toLocaleDateString());
    // console.log("endOfToday", endOfToday);
    // console.log("startOfTomorrow", startOfTomorrow);
    const filterQuery = {
      userId: req.user.id,
      ...(name && { name: { contains: name } }),
      ...(filter === "today" && {
        book_to: {
          gte: startOfToday.format(),
          lt: endOfToday.format()
        },
      }),
      ...(filter === "later" && {
        book_to: {
          gte: startOfTomorrow.format(), // Boats scheduled for future dates
        },
      }),
      ...(date && {
        book_to: new Date(date)
      }),
      ...(boat_weight_category ? { boat_weight_category } : {}),
      ...(boat_length_category
        ? { boat_length_category: toPrismaLengthCategory(boat_length_category) }
        : {}),
    };

    const boats = await prisma.boat.findMany({
      where: filterQuery,
      include: {
        DockBooking: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        book_to: 'asc'
      }
    }
    );

    boats.map((item) => {
      item.avatar_url = item.avatar_url ? baseurl + "/boat/" + item.avatar_url : null
      item.boat_length_category = toApiLengthCategory(item.boat_length_category);
      item.status = item.DockBooking.length ? 1 : 0;
      delete item.DockBooking;
      return item
    })

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_FETCHED, boats);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const getBoatById = async (req, res) => {
  const { id } = req.params;

  try {
    const boat = await prisma.boat.findUnique({
      where: { id: parseInt(id) }
    });


    if (!boat) {
      return createErrorResponse(res, 404, MessageEnum.BOAT_NOT_FOUND);
    }
    boat.avatar_url = boat.avatar_url ? baseurl + "/boat/" + boat.avatar_url : null
    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.BOAT_DATA,
      serializeBoatCategories(boat)
    )
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

// MVP1 Ventures
export const getBoatByRegistrationId = async (req, res) => {
  const { registrationId } = req.params;

  try {
    const boat = await prisma.boat.findFirst({
      where: { rego: registrationId }
    });

    if (!boat) {
      return createErrorResponse(res, 404, MessageEnum.BOAT_NOT_FOUND);
    }

    boat.avatar_url = boat.avatar_url ? baseurl + "/boat/" + boat.avatar_url : null
    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.BOAT_DATA,
      serializeBoatCategories(boat)
    );

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const updateBoat = async (req, res) => {
  const {
    name, owners_name, rego, vin, make, model, engine_no,
    engine_make, engine_model, length, app_date, book_from, book_to, email, phone_no, docking_date, boat_type, id, isBoathubRego,
    boat_weight_category, boat_length_category
  } = req.body;

  const schema = Joi.object({
    name: Joi.string().optional(),
    owners_name: Joi.string().optional().allow(''),
    rego: Joi.string().optional(),
    vin: Joi.string().optional().allow(null),
    make: Joi.string().optional(),
    model: Joi.string().optional(),
    engine_no: Joi.string().optional().allow(null),
    engine_make: Joi.string().optional().allow(null),
    engine_model: Joi.string().optional().allow('', null),
    length: Joi.string().optional().allow(null),
    app_date: Joi.date().optional().allow(''),
    book_from: Joi.date().optional().allow(''),
    book_to: Joi.date().optional().allow(''),
    email: Joi.string().email().optional(),
    phone_no: Joi.string().optional(),
    docking_date: Joi.date().optional().allow(''),
    boat_type: Joi.string().valid('Trailer Boat', 'Yacht', 'Jetski').optional(), // Boat type validation
    id: Joi.number().integer().required(),
    isBoathubRego: Joi.boolean(),  // MVP1 Ventures
    boat_weight_category: Joi.string().valid(...WEIGHT_CATEGORIES).optional().allow(null, '').messages({
      "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
    }),
    boat_length_category: Joi.string().valid(...LENGTH_CATEGORIES).optional().allow(null, '').messages({
      "any.only": LENGTH_CATEGORY_ERROR_MESSAGE,
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

  const boat = await prisma.boat.findUnique({
    where: {
      id: parseInt(id)
    }
  })
  if (!boat) {
    return createErrorResponse(res, 404, MessageEnum.BOAT_NOT_FOUND);
  }
  try {
    const updatedBoat = await prisma.boat.update({
      where: { id: parseInt(id) },
      data: {
        name: name != 'null' && name != null && name != undefined ? name : boat.name,
        owners_name: owners_name != 'null' && owners_name != null && owners_name != undefined ? owners_name : boat.owners_name,
        rego: rego != 'null' && rego != null && rego != undefined ? rego : boat.rego,
        vin: vin != 'null' && vin != null && vin != undefined ? vin : boat.vin,
        make: make != 'null' && make != null && make != undefined ? make : boat.make,
        model: model != 'null' && model != null && model != undefined ? model : boat.model,
        engine_no: engine_no != 'null' && engine_no != null && engine_no != undefined ? engine_no : boat.engine_no,
        engine_make: engine_make != 'null' && engine_make != null && engine_make != undefined ? engine_make : boat.engine_make,
        engine_model: engine_model != 'null' && engine_model != null && engine_model != undefined ? engine_model : boat.engine_model,
        length: length != 'null' && length != null && length != undefined ? length : boat.length,
        app_date: app_date != '' && app_date != 'null' && app_date && app_date != null && app_date != undefined ? new Date(app_date) : boat.app_date,
        email: email != 'null' && email != null && email != undefined ? email : boat.email,
        phone_no: phone_no != 'null' && phone_no != null && phone_no != undefined ? phone_no : boat.phone_no,
        book_from: book_from != '' && book_from != 'null' && book_from && book_from != null && book_from != undefined ? new Date(book_from) : boat.book_from,
        book_to: book_to != '' && book_to != 'null' && book_to && book_to != null && book_to != undefined ? new Date(book_to) : boat.book_to,
        docking_date: docking_date != '' && docking_date != 'null' && docking_date && docking_date != null && docking_date != undefined ? new Date(docking_date) : boat.docking_date,
        avatar_url: req.file && req.file.filename ? req.file.filename : boat.avatar_url,
        boat_type: boat_type ? boat_type : boat.boat_type,
        isBoathubRego: isBoathubRego ? (isBoathubRego ? true : false) : (boat.isBoathubRego ? true : false),   // MVP1 Ventures
        boat_weight_category:
          boat_weight_category !== undefined
            ? (boat_weight_category || null)
            : boat.boat_weight_category,
        boat_length_category:
          boat_length_category !== undefined
            ? toPrismaLengthCategory(boat_length_category)
            : boat.boat_length_category,
      },
    });

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.BOAT_UPDATED,
      serializeBoatCategories(updatedBoat)
    );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

// MVP1 Ventures
export const updateInviteStatus = async (req, res) => {
  const { id, status } = req.params;

  const schema = Joi.object({
    status: Joi.string().optional(),
    id: Joi.number().integer().required()
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

  const boat = await prisma.boat.findUnique({
    where: {
      id: parseInt(id)
    }
  })

  if (!boat) {
    return createErrorResponse(res, 404, MessageEnum.BOAT_NOT_FOUND);
  }

  try {
    const updatedInviteStatus = await prisma.boat.updateMany({
      where: { id: parseInt(id) },
      data: {
        inviteStatus: status != null && status != undefined ? status : boat.inviteStatus
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_STATUS_UPDATED, updatedInviteStatus);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

// MVP1 Ventures
export const updateOwnerEmail = async (req, res) => {
  const { id, email } = req.params;

  const schema = Joi.object({
    email: Joi.string().optional(),
    id: Joi.number().integer().required()
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

  const boat = await prisma.boat.findUnique({
    where: {
      id: parseInt(id)
    }
  })

  if (!boat) {
    return createErrorResponse(res, 404, MessageEnum.BOAT_NOT_FOUND);
  }

  try {
    const updatedEmailStatus = await prisma.boat.updateMany({
      where: { id: parseInt(id) },
      data: {
        email: email != null && email != undefined ? email : boat.email
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_OWNER_EMAIL_UPDATED, updatedEmailStatus);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const deleteBoat = async (req, res) => {
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
    const boat = await prisma.boat.findUnique({
      where: {
        id: parseInt(id)
      }
    })

    if (!boat) {
      return createErrorResponse(res, 400, MessageEnum.BOAT_NOT_FOUND, {})
    }

    await prisma.boat.delete({
      where: { id: parseInt(id) }
    });

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_DELETED, {})
  } catch (error) {
    console.log(error)
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR)
  }
};


// MVP1 Ventures
export const addInviteUser = async (req, res) => {
  const { email, userId, boatId, status } = req.body;

  const schema = Joi.object({
    email: Joi.string().required(),
    userId: Joi.number().integer().required(),
    boatId: Joi.number().integer().required(),
    status: Joi.string()
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
    const newUserInvite = await prisma.VesselInvitation.create({
      data: {
        userId,
        boatId,
        email,
        status
      }
    });

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_USER_INVITED, newUserInvite);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

// MVP1 Ventures
export const getInvitedUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const { search } = req.query;

    const filterQuery = {
      boatId: parseInt(id),
      ...(search && { email: { contains: search } })
    };

    const invitedUsers = await prisma.VesselInvitation.findMany({
      where: filterQuery,
      orderBy: {
        createdAt: 'desc'
      }
    });

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_USER_FETCHED, invitedUsers);
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};
