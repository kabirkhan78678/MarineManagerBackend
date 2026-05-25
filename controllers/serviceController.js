import { PrismaClient } from "@prisma/client";
import {
    createErrorResponse,
    createSuccessResponse
} from "../utils/responseUtil.js";

import {
    addServiceValidator,
    updateServiceValidator
} from "../validators/serviceValidators.js";

const prisma = new PrismaClient();

const servicePresetSelect = {
    id: true,
    serviceTitle: true,
    serviceCost: true,
    boatLength: true,
    boatHeight: true,
    materialCost: true,
    labourAdjustments: true,
    createdAt: true,
    updatedAt: true
};

// ==========================================
// ADD SERVICE
// ==========================================
export async function addService(req, res) {
    try {
        const { error } = addServiceValidator.validate(req.body);

        if (error) {
            return createErrorResponse(res, 400, error.details[0].message);
        }

        const {
            serviceTitle,
            serviceCost,
            boatLength,
            boatHeight,
            boathHeight,
            materialCost,
            labourAdjustments
        } = req.body;

        const normalizedBoatHeight =
            boatHeight ?? boathHeight;

        const existing = await prisma.servicePreset.findFirst({
            where: {
                serviceTitle
            }
        });

        if (existing) {
            return createErrorResponse(
                res,
                400,
                "Service with same title already exists"
            );
        }

        const service = await prisma.servicePreset.create({
            data: {
                serviceTitle,
                serviceCost: Number(serviceCost),
                boatLength: boatLength || null,
                boatHeight: normalizedBoatHeight || null,
                materialCost:
                    materialCost !== undefined && materialCost !== null && materialCost !== ""
                        ? Number(materialCost)
                        : null,
                labourAdjustments:
                    labourAdjustments !== undefined && labourAdjustments !== null && labourAdjustments !== ""
                        ? Number(labourAdjustments)
                        : null
            },
            select: servicePresetSelect
        });

        return createSuccessResponse(
            res,
            201,
            true,
            "Service created successfully",
            service
        );

    } catch (error) {
        console.log("ADD SERVICE ERROR:", error);

        if (
            error?.code === "P2022" ||
            error?.message?.includes("Unknown column")
        ) {
            return createErrorResponse(
                res,
                500,
                "Database schema is not updated for the new service fields. Please run the latest Prisma migration."
            );
        }

        return createErrorResponse(res, 500, "Internal Server Error");
    }
}

// ==========================================
// GET ALL SERVICES
// ==========================================
export async function getAllServices(req, res) {
    try {
        const { search = "" } = req.query;

        const services = await prisma.servicePreset.findMany({
            where: {
                serviceTitle: {
                    contains: search
                }
            },
            select: servicePresetSelect,
            orderBy: {
                createdAt: "desc"
            }
        });

        return createSuccessResponse(
            res,
            200,
            true,
            "Services fetched successfully",
            services
        );

    } catch (error) {
        console.log("GET ALL SERVICES ERROR:", error);
        return createErrorResponse(res, 500, "Internal Server Error");
    }
}

// ==========================================
// GET SINGLE SERVICE
// ==========================================
export async function getServiceById(req, res) {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return createErrorResponse(res, 400, "Invalid service id");
        }

        const service = await prisma.servicePreset.findUnique({
            where: { id },
            select: servicePresetSelect
        });

        if (!service) {
            return createErrorResponse(res, 404, "Service not found");
        }

        return createSuccessResponse(
            res,
            200,
            true,
            "Service fetched successfully",
            service
        );

    } catch (error) {
        console.log("GET SERVICE ERROR:", error);
        return createErrorResponse(res, 500, "Internal Server Error");
    }
}

// ==========================================
// UPDATE SERVICE
// ==========================================
export async function updateService(req, res) {
    try {
        const {
            id,
            serviceTitle,
            serviceCost,
            boatLength,
            boatHeight,
            boathHeight,
            materialCost,
            labourAdjustments
        } = req.body;

        const normalizedBoatHeight =
            boatHeight ?? boathHeight;

        if (!id || isNaN(parseInt(id))) {
            return createErrorResponse(res, 400, "Invalid service id");
        }

        const parsedId = parseInt(id);

        const { error } = updateServiceValidator.validate({
            serviceTitle,
            serviceCost,
            boatLength,
            boatHeight: normalizedBoatHeight,
            boathHeight,
            materialCost,
            labourAdjustments
        });

        if (error) {
            return createErrorResponse(res, 400, error.details[0].message);
        }

        const existing = await prisma.servicePreset.findUnique({
            where: { id: parsedId }
        });

        if (!existing) {
            return createErrorResponse(res, 404, "Service not found");
        }

        if (serviceTitle) {
            const duplicate = await prisma.servicePreset.findFirst({
                where: {
                    serviceTitle,
                    NOT: { id: parsedId }
                }
            });

            if (duplicate) {
                return createErrorResponse(
                    res,
                    400,
                    "Service with same title already exists"
                );
            }
        }

        const updated = await prisma.servicePreset.update({
            where: { id: parsedId },
            data: {
                serviceTitle: serviceTitle ?? existing.serviceTitle,
                serviceCost:
                    serviceCost !== undefined
                        ? Number(serviceCost)
                        : existing.serviceCost,
                boatLength:
                    boatLength !== undefined
                        ? (boatLength || null)
                        : existing.boatLength,
                boatHeight:
                    normalizedBoatHeight !== undefined
                        ? (normalizedBoatHeight || null)
                        : existing.boatHeight,
                materialCost:
                    materialCost !== undefined
                        ? (
                            materialCost === null || materialCost === ""
                                ? null
                                : Number(materialCost)
                        )
                        : existing.materialCost,
                labourAdjustments:
                    labourAdjustments !== undefined
                        ? (
                            labourAdjustments === null || labourAdjustments === ""
                                ? null
                                : Number(labourAdjustments)
                        )
                        : existing.labourAdjustments
            },
            select: servicePresetSelect
        });

        return createSuccessResponse(
            res,
            200,
            true,
            "Service updated successfully",
            updated
        );

    } catch (error) {
        console.log("UPDATE SERVICE ERROR:", error);

        if (
            error?.code === "P2022" ||
            error?.message?.includes("Unknown column")
        ) {
            return createErrorResponse(
                res,
                500,
                "Database schema is not updated for the new service fields. Please run the latest Prisma migration."
            );
        }

        return createErrorResponse(res, 500, "Internal Server Error");
    }
}

// ==========================================
// DELETE SERVICE
// ==========================================
export async function deleteService(req, res) {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return createErrorResponse(res, 400, "Invalid service id");
        }

        const existing = await prisma.servicePreset.findUnique({
            where: { id }
        });

        if (!existing) {
            return createErrorResponse(res, 404, "Service not found");
        }

        await prisma.servicePreset.delete({
            where: { id }
        });

        return createSuccessResponse(
            res,
            200,
            true,
            "Service deleted successfully"
        );

    } catch (error) {
        console.log("DELETE SERVICE ERROR:", error);
        return createErrorResponse(res, 500, "Internal Server Error");
    }
}
