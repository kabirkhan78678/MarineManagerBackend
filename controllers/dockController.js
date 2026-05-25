import { PrismaClient } from '@prisma/client';
import Joi from "joi";
import { MessageEnum } from "../config/message.js";
import {
  LENGTH_CATEGORIES,
  LENGTH_CATEGORY_ERROR_MESSAGE,
  WEIGHT_CATEGORIES,
  WEIGHT_CATEGORY_ERROR_MESSAGE,
  toApiLengthCategory,
  toPrismaLengthCategory
} from "../constants/categoryConstants.js";
const baseurl = process.env.BASE_URL;
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
const prisma = new PrismaClient();

function serializeDockCategories(dock) {
  if (!dock) return dock;

  return {
    ...dock,
    dock_length_category: toApiLengthCategory(dock.dock_length_category),
  };
}

function serializeBoatCategories(boat) {
  if (!boat) return boat;

  return {
    ...boat,
    boat_length_category: toApiLengthCategory(boat.boat_length_category),
  };
}

function getDockCapacity(dock) {
  const capacity = Number.parseInt(dock?.dock_capacity ?? 0, 10);
  return Number.isFinite(capacity) && capacity > 0 ? capacity : 0;
}

function isBookingOverlappingRange(booking, rangeStart, rangeEnd) {
  const bookingFrom = new Date(booking.book_from);
  const bookingTo = new Date(booking.book_to);

  return bookingFrom <= rangeEnd && bookingTo >= rangeStart;
}

function buildDockOccupancy(activeBookingsCount, dockCapacity) {
  const occupiedSlots = Math.max(Number(activeBookingsCount) || 0, 0);
  const totalSlots = Math.max(Number(dockCapacity) || 0, 0);
  const rawPercentage = totalSlots === 0
    ? 0
    : (occupiedSlots / totalSlots) * 100;
  const percentage = Number(Math.min(rawPercentage, 100).toFixed(2));

  return {
    occupied_slots: occupiedSlots,
    available_slots: Math.max(totalSlots - occupiedSlots, 0),
    total_slots: totalSlots,
    percentage,
    display_percentage: `${percentage}%`,
  };
}

function parseDockUtilizationFilters(query) {
  const schema = Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    month: Joi.number().integer().min(1).max(12).optional(),
    year: Joi.number().integer().min(2000).max(9999).optional(),
    dockId: Joi.number().integer().positive().optional(),
  }).custom((value, helpers) => {
    if (value.endDate && !value.startDate) {
      return helpers.error("any.invalid", {
        message: "'startDate' is required when 'endDate' is provided",
      });
    }

    return value;
  });

  const { error, value } = schema.validate(query);

  if (error) {
    return {
      error: error.details?.[0]?.context?.message || error.details?.[0]?.message,
    };
  }

  let filterStartDate;
  let filterEndDate;

  if (value.startDate && value.endDate) {
    filterStartDate = new Date(value.startDate);
    filterStartDate.setHours(0, 0, 0, 0);

    filterEndDate = new Date(value.endDate);
    filterEndDate.setHours(23, 59, 59, 999);
  } else if (value.startDate) {
    filterStartDate = new Date(value.startDate);
    filterStartDate.setHours(0, 0, 0, 0);

    filterEndDate = new Date(value.startDate);
    filterEndDate.setHours(23, 59, 59, 999);
  } else if (value.month && value.year) {
    filterStartDate = new Date(value.year, value.month - 1, 1, 0, 0, 0, 0);
    filterEndDate = new Date(value.year, value.month, 0, 23, 59, 59, 999);
  } else if (value.year) {
    filterStartDate = new Date(value.year, 0, 1, 0, 0, 0, 0);
    filterEndDate = new Date(value.year, 11, 31, 23, 59, 59, 999);
  } else {
    const today = new Date();
    filterStartDate = new Date(today);
    filterStartDate.setHours(0, 0, 0, 0);

    filterEndDate = new Date(today);
    filterEndDate.setHours(23, 59, 59, 999);
  }

  return {
    value: {
      dockId: value.dockId,
      filterStartDate,
      filterEndDate,
    },
  };
}

export const createDock = async (req, res) => {
  const {
    name, dock_capacity, email, phone_no, booking_cost, booking_cost_per_day, address,
    dock_weight_category, dock_length_category,
  } = req.body;

  const schema = Joi.object({

    name: Joi.string().required(),
    dock_capacity: Joi.alternatives().try(
      Joi.string().trim().pattern(/^\d+$/),
      Joi.number().integer().min(1)
    ).optional(),
    email: Joi.string().email().optional().allow(''),
    phone_no: Joi.string().optional().allow(''),
    booking_cost: Joi.string().optional().allow(''),
    booking_cost_per_day: Joi.string().optional().allow(''),
    address: Joi.string().required(),
    dock_weight_category: Joi.string().valid(...WEIGHT_CATEGORIES).optional().allow(null, '').messages({
      "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
    }),
    dock_length_category: Joi.string().valid(...LENGTH_CATEGORIES).optional().allow(null, '').messages({
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

  try {
    const capacity = dock_capacity !== undefined && dock_capacity !== '' ? parseInt(dock_capacity, 10) : undefined;
    const newDock = await prisma.dock.create({
      data: {
        name,
        ...(capacity !== undefined ? { dock_capacity: capacity } : {}),
        email,
        phone_no,
        userId: req.user.id,
        booking_cost,
        booking_cost_per_day,
        address,
        dock_weight_category: dock_weight_category || null,
        dock_length_category: toPrismaLengthCategory(dock_length_category),
      }
    });

    return createSuccessResponse(
      res,
      201,
      true,
      MessageEnum.DOCK_CREATED,
      serializeDockCategories(newDock)
    );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const getAllDock = async (req, res) => {
  try {

    const { dock_weight_category, dock_length_category } = req.query;

    const querySchema = Joi.object({
      dock_weight_category: Joi.string()
        .valid(...WEIGHT_CATEGORIES)
        .optional()
        .messages({
          "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
        }),

      dock_length_category: Joi.string()
        .valid(...LENGTH_CATEGORIES)
        .optional()
        .messages({
          "any.only": LENGTH_CATEGORY_ERROR_MESSAGE,
        }),
    });

    const { error } = querySchema.validate({
      dock_weight_category,
      dock_length_category,
    });

    if (error) {
      return createErrorResponse(res, 400, error.details[0].message);
    }

    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const docks = await prisma.dock.findMany({
      where: {
        userId: req.user.id,

        ...(dock_weight_category
          ? { dock_weight_category }
          : {}),

        ...(dock_length_category
          ? {
            dock_length_category:
              toPrismaLengthCategory(dock_length_category),
          }
          : {}),
      },

      include: {
        DockBooking: {
          include: {
            boat: true,
          },

          orderBy: {
            book_from: "asc",
          },
        },
      },

      orderBy: {
        id: "desc",
      },
    });

    const totalCapacity = docks.reduce((sum, dock) => {
      return sum + getDockCapacity(dock);
    }, 0);

    const activeBookings = docks.reduce((count, dock) => {

      const todayBookings = dock.DockBooking.filter((booking) =>
        isBookingOverlappingRange(
          booking,
          startOfToday,
          endOfToday
        )
      );

      return count + todayBookings.length;

    }, 0);

    const revenueToday = docks.reduce((total, dock) => {

      const perDayRate = Number(
        dock.booking_cost_per_day || 0
      );

      if (!perDayRate) return total;

      const todayBookingsCount = dock.DockBooking.filter((booking) =>
        isBookingOverlappingRange(
          booking,
          startOfToday,
          endOfToday
        )
      ).length;

      return total + (todayBookingsCount * perDayRate);

    }, 0);

    const avgOccupancy =
      totalCapacity === 0
        ? 0
        : Number(
          (
            (activeBookings / totalCapacity) *
            100
          ).toFixed(2)
        );

    const docksWithBookedDates = docks.map((dock) => {

      const todayBookings = dock.DockBooking.filter((booking) =>
        isBookingOverlappingRange(
          booking,
          startOfToday,
          endOfToday
        )
      );

      const dockCapacity = getDockCapacity(dock);

      const occupancy = buildDockOccupancy(
        todayBookings.length,
        dockCapacity
      );

      const status =
        todayBookings.length > 0
          ? "occupied"
          : "available";

      return {
        id: dock.id,
        name: dock.name,
        dock_capacity: dock.dock_capacity,
        email: dock.email,
        phone_no: dock.phone_no,
        userId: dock.userId,
        booking_cost: dock.booking_cost,
        booking_cost_per_day: dock.booking_cost_per_day,
        address: dock.address,
        dock_weight_category: dock.dock_weight_category,
        dock_length_category: toApiLengthCategory(
          dock.dock_length_category
        ),

        // SAME STATUS
        status: status,

        // OCCUPANCY DETAILS
        occupancy,
        occupancy_percentage: occupancy.percentage,
        occupied_slots: occupancy.occupied_slots,
        available_slots: occupancy.available_slots,
        active_bookings_count: todayBookings.length,

        // ACTIVE BOATS INSIDE DOCK
        active_boats: todayBookings.map((booking) => ({
          booking_id: booking.id,

          booking_from: booking.book_from,
          booking_to: booking.book_to,

          boat: booking.boat
            ? {
              id: booking.boat.id,
              name: booking.boat.name,
              email: booking.boat.email,
              phone_no: booking.boat.phone_no,

              avatar_url: booking.boat.avatar_url
                ? baseurl +
                "/boat/" +
                booking.boat.avatar_url
                : null,

              boat_weight_category:
                booking.boat.boat_weight_category,

              boat_length_category:
                toApiLengthCategory(
                  booking.boat.boat_length_category
                ),
            }
            : null,
        })),

        // ALL BOOKINGS
        DockBooking: dock.DockBooking.map((booking) => ({
          ...booking,

          boat: serializeBoatCategories(
            booking.boat
          ),
        })),

        bookedDates: dock.DockBooking.map((booking) => ({
          from: booking.book_from,
          to: booking.book_to,
        })),
      };
    });

    await Promise.all(
      docksWithBookedDates.map(async (dock) => {

        await Promise.all(
          dock.DockBooking.map(async (booking) => {

            if (booking.boat?.avatar_url) {

              booking.boat.avatar_url =
                baseurl +
                "/boat/" +
                booking.boat.avatar_url;
            }
          })
        );
      })
    );

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.DOCK_FETCHED,
      {
        summary: {
          total_capacity: totalCapacity,
          avg_occupancy: avgOccupancy,
          active_bookings: activeBookings,
          revenue_today: Number(
            revenueToday.toFixed(2)
          ),
        },

        docks: docksWithBookedDates,
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
};

export const getDockById = async (req, res) => {
  const { id } = req.params;
  try {
    const dockId = parseInt(id, 10);

    if (Number.isNaN(dockId)) {
      return createErrorResponse(res, 400, "Valid dock id is required");
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const dock = await prisma.dock.findFirst({
      where: { id: dockId, userId: req.user.id },
      include: {
        DockBooking: {
          include: {
            boat: true,
          },
          orderBy: {
            book_from: "asc",
          },
        },
      }
    });
    if (!dock) {
      return createErrorResponse(res, 404, MessageEnum.DOCK_NOT_FOUND);
    }

    const todayBookings = dock.DockBooking.filter((booking) =>
      isBookingOverlappingRange(booking, startOfToday, endOfToday)
    );
    const occupancy = buildDockOccupancy(
      todayBookings.length,
      getDockCapacity(dock)
    );

    const dockData = {
      ...serializeDockCategories(dock),
      status: todayBookings.length ? "occupied" : "available",
      occupancy,
      occupancy_percentage: occupancy.percentage,
      occupied_slots: occupancy.occupied_slots,
      available_slots: occupancy.available_slots,
      active_bookings_count: todayBookings.length,
      DockBooking: dock.DockBooking.map((booking) => ({
        ...booking,
        boat: serializeBoatCategories(booking.boat),
      })),
      bookedDates: dock.DockBooking.map((booking) => ({
        from: booking.book_from,
        to: booking.book_to,
      })),
    };

    await Promise.all(
      dockData.DockBooking.map(async (booking) => {
        if (booking.boat?.avatar_url) {
          booking.boat.avatar_url = baseurl + "/boat/" + booking.boat.avatar_url;
        }
      })
    );

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.DOCK_DATA,
      dockData
    )
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const updateDock = async (req, res) => {
  const {
    name, dock_capacity, email, phone_no, booking_cost, booking_cost_per_day, address, id,
    dock_weight_category, dock_length_category,
  } = req.body;

  const schema = Joi.object({
    name: Joi.string().optional(),
    dock_capacity: Joi.alternatives().try(
      Joi.string().trim().pattern(/^\d+$/),
      Joi.number().integer().min(1)
    ).optional(),
    email: Joi.string().email().optional().allow(''),
    phone_no: Joi.string().optional().allow(''),
    booking_cost: Joi.string().optional().allow(''),
    booking_cost_per_day: Joi.string().optional().allow(''),
    address: Joi.string().optional().allow(''),
    dock_weight_category: Joi.string().valid(...WEIGHT_CATEGORIES).optional().allow(null, '').messages({
      "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
    }),
    dock_length_category: Joi.string().valid(...LENGTH_CATEGORIES).optional().allow(null, '').messages({
      "any.only": LENGTH_CATEGORY_ERROR_MESSAGE,
    }),
    id: Joi.number().integer().required(),
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

  const dock = await prisma.dock.findFirst({
    where: { id: parseInt(id, 10), userId: req.user.id },
  });

  if (!dock) {
    return createErrorResponse(res, 404, MessageEnum.DOCK_NOT_FOUND);
  }


  try {
    const updatedDock = await prisma.dock.update({
      where: { id: parseInt(id) },
      data: {
        name: name != null ? name : dock.name,
        dock_capacity: dock_capacity != null
          ? dock_capacity
          : dock.dock_capacity,
        email: email != null ? email : dock.email,
        phone_no: phone_no != null ? phone_no : dock.phone_no,
        booking_cost: booking_cost != null ? booking_cost : dock.booking_cost,
        booking_cost_per_day: booking_cost_per_day != null ? booking_cost_per_day : dock.booking_cost_per_day,
        address: address != null ? address : dock.address,
        dock_weight_category:
          dock_weight_category !== undefined
            ? (dock_weight_category || null)
            : dock.dock_weight_category,
        dock_length_category:
          dock_length_category !== undefined
            ? toPrismaLengthCategory(dock_length_category)
            : dock.dock_length_category,
      }
    });

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.DOCK_UPDATED,
      serializeDockCategories(updatedDock)
    );
  } catch (error) {
    console.error(error);

    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const deleteDock = async (req, res) => {
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
    const dock = await prisma.dock.findFirst({
      where: {
        id: parseInt(id, 10),
        userId: req.user.id
      },
      include: {
        DockBooking: {
          select: {
            id: true,
            boatId: true
          }
        }
      }
    })

    if (!dock) {
      return createErrorResponse(res, 400, MessageEnum.DOCK_NOT_FOUND, {})
    }

    const hasAssignedBoat = dock.DockBooking.some((booking) => booking.boatId !== null);
    if (hasAssignedBoat) {
      return res.status(400).json({
        success: false,
        message: "This dock cannot be deleted because a boat is assigned to it.",
        status: 400,
      });
    }

    await prisma.dock.delete({
      where: { id: parseInt(id) }
    });
    return createSuccessResponse(res, 200, true, MessageEnum.DOCK_DELETED, {})
  } catch (error) {
    console.log(error)
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR)
  }
};

export const availableBoats = async (req, res) => {
  try {
    const availableBoats = await prisma.boat.findMany({
      where: {
        userId: req.user.id,
        DockBooking: {
          none: {}, // This ensures the boat has no associated DockBooking
        },
      }, orderBy: {
        createdAt: 'desc'
      }
    });

    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.AVAILABLE_BOATS,
      availableBoats.map(serializeBoatCategories)
    )
  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const assignDockBooking = async (req, res) => {
  const { dockId, boatId, book_from, book_to } = req.body;

  const schema = Joi.object({
    dockId: Joi.number().integer().required(),
    boatId: Joi.number().integer().required(),
    book_from: Joi.date().required(),
    book_to: Joi.date().required(),
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
    const bookingStartDate = new Date(book_from);
    const bookingEndDate = new Date(book_to);

    if (bookingEndDate < bookingStartDate) {
      return createErrorResponse(
        res,
        400,
        "'book_to' must be greater than or equal to 'book_from'"
      );
    }

    const [dock, boat] = await Promise.all([
      prisma.dock.findFirst({
        where: {
          id: parseInt(dockId),
          userId: req.user.id,
        },
      }),
      prisma.boat.findFirst({
        where: {
          id: parseInt(boatId),
          userId: req.user.id,
        },
      }),
    ]);

    if (!dock) {
      return createErrorResponse(res, 404, MessageEnum.DOCK_NOT_FOUND);
    }

    if (!boat) {
      return createErrorResponse(res, 404, MessageEnum.BOAT_NOT_FOUND);
    }

    // Check for overlapping bookings
    const overlappingBooking = await prisma.dockBooking.findFirst({
      where: {
        dockId: parseInt(dockId),
        OR: [
          {
            book_from: { lte: bookingEndDate },
            book_to: { gte: bookingStartDate },
          },
        ],
      },
    });


    if (overlappingBooking) {
      return createErrorResponse(res, 400, MessageEnum.DOCK_ALREADY_BOOKED);
    }

    // Create a new dock booking
    const newBooking = await prisma.dockBooking.create({
      data: {
        dockId: parseInt(dockId),
        boatId: parseInt(boatId),
        book_from: bookingStartDate,
        book_to: bookingEndDate,
        userId: req.user.id
      },
    });

    return createSuccessResponse(res, 200, true, MessageEnum.BOAT_ASSIGNED);
  } catch (error) {
    console.log(error);
    if (error.code === 'P2003') {
      return createErrorResponse(res, 400, "Invalid dockId or boatId");
    }
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

// by kashish
export const getDockOccupancy = async (req, res) => {
  try {
    const parsedFilters = parseDockUtilizationFilters(req.query);

    if (parsedFilters.error) {
      return createErrorResponse(res, 400, parsedFilters.error);
    }

    const { dockId, filterStartDate, filterEndDate } = parsedFilters.value;

    if (filterEndDate < filterStartDate) {
      return createErrorResponse(
        res,
        400,
        "Invalid filter: 'to' date must be >= 'from' date"
      );
    }

    let whereCondition = {
      userId: req.user.id
    };

    if (dockId) {
      whereCondition.id = dockId;
    }

    const docks = await prisma.dock.findMany({
      where: whereCondition,
      include: {
        DockBooking: {
          include: {
            boat: true
          }
        }
      }
    });

    if (dockId && docks.length === 0) {
      return createErrorResponse(res, 404, "Dock not found");
    }

    let total = docks.length;
    let occupied = 0;
    let available = 0;

    const result = docks.map(dock => {

      const filteredBookings = dock.DockBooking.filter((booking) => {
        const from = new Date(booking.book_from);
        const to = new Date(booking.book_to);

        if (to < from) return false;

        return isBookingOverlappingRange(booking, filterStartDate, filterEndDate);
      });

      const isOccupied = filteredBookings.length > 0;
      const dockCapacity = getDockCapacity(dock);
      const occupancy = buildDockOccupancy(filteredBookings.length, dockCapacity);

      if (isOccupied) occupied++;
      else available++;
      let revenue = 0;

      filteredBookings.forEach(b => {
        const from = new Date(b.book_from);
        const to = new Date(b.book_to);

        if (to < from) return;

        const days = Math.ceil(
          (to - from) / (1000 * 60 * 60 * 24)
        ) || 1;

        revenue += days * Number(dock.booking_cost_per_day || 0);
      });

      return {
        dockId: dock.id,
        dockName: dock.name,
        status: isOccupied ? "Occupied" : "Available",
        filteredBookingsCount: filteredBookings.length,
        occupancy,
        occupancy_percentage: occupancy.percentage,
        occupied_slots: occupancy.occupied_slots,
        available_slots: occupancy.available_slots,
        revenue,

        bookings: filteredBookings.map(b => ({
          id: b.id,
          dockId: b.dockId,
          boatId: b.boatId,
          book_from: b.book_from,
          book_to: b.book_to,
          boat: serializeBoatCategories(b.boat)
        }))
      };
    });

    return createSuccessResponse(res, 200, true, "Dock Occupancy Data", {
      summary: {
        total,
        occupied,
        available
      },
      filter: {
        from: filterStartDate,
        to: filterEndDate
      },
      data: result
    });

  } catch (error) {
    console.log(error);
    return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
  }
};

export const getDockUtilization = getDockOccupancy;


export const getFilteredDocks = async (req, res) => {
  try {
    const {
      status,
      month,
      year,
      id,
      start_date,
      end_date,
      dock_weight_category,
      dock_length_category,
    } = req.query;

    // ✅ 1. Auth check
    if (!req.user || !req.user.id) {
      return createErrorResponse(res, 401, "Unauthorized");
    }

    // ✅ 2. Status validation
    const VALID_STATUS = ["occupied", "available"];
    const normalizedStatus = status?.toLowerCase();

    if (status && !VALID_STATUS.includes(normalizedStatus)) {
      return createErrorResponse(res, 400, "Invalid status");
    }

    const querySchema = Joi.object({
      dock_weight_category: Joi.string().valid(...WEIGHT_CATEGORIES).optional().messages({
        "any.only": WEIGHT_CATEGORY_ERROR_MESSAGE,
      }),
      dock_length_category: Joi.string().valid(...LENGTH_CATEGORIES).optional().messages({
        "any.only": LENGTH_CATEGORY_ERROR_MESSAGE,
      }),
    });
    const { error } = querySchema.validate({
      dock_weight_category,
      dock_length_category,
    });

    if (error) {
      return createErrorResponse(res, 400, error.details[0].message);
    }

    // ✅ 3. ID validation
    let dockId = null;

    if (id) {
      dockId = parseInt(id);

      if (isNaN(dockId)) {
        return createErrorResponse(res, 400, "Invalid dock id");
      }
    }

    // ✅ 4. Date Logic
    let startDate, endDate;

    // 🔴 Case 1: start_date + end_date
    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);

      if (isNaN(startDate) || isNaN(endDate)) {
        return createErrorResponse(res, 400, "Invalid date range");
      }

      if (startDate > endDate) {
        return createErrorResponse(
          res,
          400,
          "start_date cannot be greater than end_date"
        );
      }

      // include full end date
      endDate.setDate(endDate.getDate() + 1);
    }

    // 🟡 Case 2: ONLY start_date
    else if (start_date) {
      startDate = new Date(start_date);

      if (isNaN(startDate)) {
        return createErrorResponse(res, 400, "Invalid start_date");
      }

      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);
    }

    // 🟢 Case 3: month/year
    else if (month) {
      const parsedMonth = parseInt(month);
      const parsedYear = year
        ? parseInt(year)
        : new Date().getFullYear();

      if (
        isNaN(parsedMonth) ||
        parsedMonth < 1 ||
        parsedMonth > 12 ||
        isNaN(parsedYear)
      ) {
        return createErrorResponse(res, 400, "Invalid month/year");
      }

      startDate = new Date(parsedYear, parsedMonth - 1, 1);
      endDate = new Date(parsedYear, parsedMonth, 1);
    }

    // 🔵 Case 4: default today
    else {
      const today = new Date();

      startDate = new Date(today.setHours(0, 0, 0, 0));

      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);
    }

    // ✅ 5. DB query
    const whereClause = {
      userId: req.user.id,
      ...(dockId && { id: dockId }),
      ...(dock_weight_category ? { dock_weight_category } : {}),
      ...(dock_length_category
        ? { dock_length_category: toPrismaLengthCategory(dock_length_category) }
        : {}),
    };

    const docks = await prisma.dock.findMany({
      where: whereClause,
      include: {
        DockBooking: {
          where: {
            book_from: {
              lt: endDate,
            },
            book_to: {
              gte: startDate,
            },
          },
          include: {
            boat: true,
          },
          orderBy: {
            book_from: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    // ✅ 6. Process docks
    const result = docks.map((dock) => {
      const isOccupied = dock.DockBooking.length > 0;
      const occupancy = buildDockOccupancy(
        dock.DockBooking.length,
        getDockCapacity(dock)
      );
      const dockStatus = isOccupied ? "occupied" : "available";

      return {
        ...serializeDockCategories(dock),
        status: dockStatus,
        occupancy,
        occupancy_percentage: occupancy.percentage,
        occupied_slots: occupancy.occupied_slots,
        available_slots: occupancy.available_slots,
        active_bookings_count: dock.DockBooking.length,
        DockBooking: dock.DockBooking.map((booking) => ({
          ...booking,
          boat: serializeBoatCategories(booking.boat),
        })),
        bookedDates: dock.DockBooking.map((booking) => ({
          from: booking.book_from,
          to: booking.book_to,
        })),
      };
    });

    // ✅ 7. Apply status filter
    const filteredData = normalizedStatus
      ? result.filter((dock) => dock.status === normalizedStatus)
      : result;

    // ✅ 8. Counts
    let occupiedCount = 0;
    let availableCount = 0;

    // if status filter applied → show filtered counts
    if (normalizedStatus) {
      occupiedCount = filteredData.filter(
        (dock) => dock.status === "occupied"
      ).length;

      availableCount = filteredData.filter(
        (dock) => dock.status === "available"
      ).length;
    }

    // if no status filter → show total counts
    else {
      occupiedCount = result.filter(
        (dock) => dock.status === "occupied"
      ).length;

      availableCount = result.filter(
        (dock) => dock.status === "available"
      ).length;
    }

    // ✅ 9. Fix boat avatar URLs
    await Promise.all(
      filteredData.map(async (dock) => {
        await Promise.all(
          dock.DockBooking.map(async (booking) => {
            if (booking.boat?.avatar_url) {
              booking.boat.avatar_url =
                baseurl + "/boat/" + booking.boat.avatar_url;
            }
          })
        );
      })
    );

    // ✅ 10. Final response
    return createSuccessResponse(
      res,
      200,
      true,
      MessageEnum.DOCK_FETCHED,
      {
        counts: {
          occupied: occupiedCount,
          available: availableCount,
        },
        data: filteredData,
      }
    );
  } catch (error) {
    console.error("Dock Filter Error:", error);

    return createErrorResponse(
      res,
      500,
      MessageEnum.INTERNAL_SERVER_ERROR
    );
  }
};
