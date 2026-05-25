import Joi from "joi";

export const addServiceValidator = Joi.object({
    serviceTitle: Joi.string().trim().required().messages({
        "string.empty": "Service title is required",
        "any.required": "Service title is required"
    }),

    serviceCost: Joi.number().positive().required().messages({
        "number.base": "Service cost must be a number",
        "number.positive": "Service cost must be greater than 0",
        "any.required": "Service cost is required"
    }),

    boatLength: Joi.string().trim().allow("", null).optional(),

    boatHeight: Joi.string().trim().allow("", null).optional(),

    boathHeight: Joi.string().trim().allow("", null).optional(),

    materialCost: Joi.number().positive().allow(null).optional().messages({
        "number.base": "Material cost must be a number",
        "number.positive": "Material cost must be greater than 0"
    }),

    labourAdjustments: Joi.number().allow(null).optional().messages({
        "number.base": "Labour adjustments must be a number"
    })
});

export const updateServiceValidator = Joi.object({
    serviceTitle: Joi.string().trim(),

    serviceCost: Joi.number().positive(),

    boatLength: Joi.string().trim().allow("", null).optional(),

    boatHeight: Joi.string().trim().allow("", null).optional(),

    boathHeight: Joi.string().trim().allow("", null).optional(),

    materialCost: Joi.number().positive().allow(null).optional().messages({
        "number.base": "Material cost must be a number",
        "number.positive": "Material cost must be greater than 0"
    }),

    labourAdjustments: Joi.number().allow(null).optional().messages({
        "number.base": "Labour adjustments must be a number"
    })
}).min(1).messages({
    "object.min": "At least one field is required for update"
});
