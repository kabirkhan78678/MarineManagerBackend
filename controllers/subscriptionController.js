// subscriptionController.js
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import Joi from "joi";
import { MessageEnum } from "../config/message.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";

const prisma = new PrismaClient();

/**
 * NOTE: For quick local testing you asked to hardcode keys.
 * - stripeCurrent: the key your app normally uses (test or live)
 * - stripeOther: set to null to disable probing the other mode (recommended while debugging)
 *
 * Replace the placeholder values with real keys for local testing only.
 * DO NOT commit live keys to a public repo.
 */
const stripeCurrent = new Stripe(
    "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",
    { apiVersion: "2022-11-15" }
);

// Disable probing by default to avoid auth errors from invalid keys.
// If you want to enable probing, replace null with a Stripe instance created with your other-mode key.
let stripeOther = null;
// Example to enable probing (ONLY for local testing, replace the placeholder):
// try {
//   stripeOther = new Stripe("sk_live_REPLACE_WITH_YOUR_LIVE_KEY", { apiVersion: "2022-11-15" });
// } catch (e) {
//   console.warn("stripeOther init failed, keeping as null:", e?.message || e);
// }

/**
 * Robust helper: get or create stripe customer in current mode.
 * - If user.stripeCustomerId exists but not found in current mode, optionally checks stripeOther (if configured).
 * - If found in other mode or not found anywhere, creates a new customer in current mode and updates prisma.user.stripeCustomerId.
 * - Handles stripeOther auth failures gracefully (disables further probing).
 */
async function getOrCreateStripeCustomer(user, defaultPaymentMethod = null) {
    if (!user) {
        throw new Error("User is required for getOrCreateStripeCustomer");
    }

    // Attempt to retrieve customer in current mode if an id exists
    if (user?.stripeCustomerId) {
        try {
            console.log("Attempting to retrieve Stripe customer in current mode:", user.stripeCustomerId);
            const existing = await stripeCurrent.customers.retrieve(user.stripeCustomerId);
            if (existing && !existing.deleted) {
                console.log("Found stripe customer in current mode:", existing.id);
                return existing;
            }
        } catch (err) {
            // If customer not found in current mode, handle specially
            if (err && err.type === "StripeInvalidRequestError" && err.code === "resource_missing") {
                console.warn(`Customer ${user.stripeCustomerId} not found in current stripe mode.`);

                // Try other mode if configured
                if (stripeOther) {
                    try {
                        console.log("Probing other stripe mode for customer:", user.stripeCustomerId);
                        const custOther = await stripeOther.customers.retrieve(user.stripeCustomerId);
                        if (custOther && !custOther.deleted) {
                            console.info(`Customer ${user.stripeCustomerId} exists in other mode; creating new customer in current mode.`);
                            const newCust = await stripeCurrent.customers.create({
                                email: user.email,
                                name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
                                ...(defaultPaymentMethod
                                    ? { payment_method: defaultPaymentMethod, invoice_settings: { default_payment_method: defaultPaymentMethod } }
                                    : {}),
                            });
                            await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: newCust.id } });
                            return newCust;
                        }
                    } catch (otherErr) {
                        // If other client auth fails, disable probing and fall back to create in current mode
                        if (otherErr && otherErr.type === "StripeAuthenticationError") {
                            console.warn("stripeOther authentication failed — disabling probe for other mode. Message:", otherErr.message);
                            stripeOther = null;
                        } else {
                            console.warn("Error checking other stripe client (will create new customer):", otherErr?.message || otherErr);
                        }
                    }
                }

                // Create a new customer in current mode and update DB
                console.info("Creating new Stripe customer in current mode for user:", user.id);
                const created = await stripeCurrent.customers.create({
                    email: user.email,
                    name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
                    ...(defaultPaymentMethod
                        ? { payment_method: defaultPaymentMethod, invoice_settings: { default_payment_method: defaultPaymentMethod } }
                        : {}),
                });
                await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: created.id } });
                return created;
            }

            // If authentication error for current mode -> bubble up
            if (err && err.type === "StripeAuthenticationError") {
                console.error("Stripe current client authentication failed. Please check the API key used by stripeCurrent.", err.message);
                throw err;
            }

            // Otherwise rethrow so caller can handle
            throw err;
        }
    }

    // No stripeCustomerId in DB: create new in current mode
    console.info("No stripeCustomerId in DB for user", user.id, "- creating new customer in current mode.");
    const newCust = await stripeCurrent.customers.create({
        email: user.email,
        name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
        ...(defaultPaymentMethod
            ? { payment_method: defaultPaymentMethod, invoice_settings: { default_payment_method: defaultPaymentMethod } }
            : {}),
    });
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: newCust.id } });
    return newCust;
}

/* -----------------------
   Controller functions
   ----------------------- */

export async function cancelSubscription(req, res) {
    try {
        const userId = req.user.id;
        const userSubscription = await prisma.subscription.findFirst({
            where: {
                userId: parseInt(userId),
                sub_status: { notIn: [3] }, // not cancelled state
            },
        });

        if (!userSubscription) {
            return createErrorResponse(res, 404, MessageEnum.NO_ACTIVE_SUBSCRIPTION);
        }

        const stripeResponse = await stripeCurrent.subscriptions.cancel(userSubscription.stripeSubscriptionId);

        return createSuccessResponse(res, 200, true, MessageEnum.SUBSCRIPTION_CANCELLED, { stripeResponse });
    } catch (error) {
        console.error("Error cancelling subscription:", error && (error.stack || error));
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR, { error: error?.message || String(error) });
    }
}

export async function getAllPlans(req, res) {
    try {
        const plans = await prisma.plan.findMany({
            where: {
                stripePriceId: {
                    not: null,
                },
            },
        });
        return createSuccessResponse(res, 200, true, MessageEnum.PLAN_DATA, plans);
    } catch (error) {
        console.error("getAllPlans error:", error && (error.stack || error));
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
}

export async function getMySubscriptionOrTrail(req, res) {
    try {
        const subscription = await prisma.subscription.findMany({
            where: { userId: req.user.id },
            include: { plan: true },
        });
        return createSuccessResponse(res, 200, true, MessageEnum.SUBSCRIPTION_DATA, subscription);
    } catch (error) {
        console.error("getMySubscriptionOrTrail error:", error && (error.stack || error));
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
}

export async function upgradePlan(req, res) {
    const { newPlanId } = req.body;

    const schema = Joi.object({ newPlanId: Joi.number().integer().required() });
    const { error } = schema.validate(req.body);
    if (error) {
        const message = error.details.map((i) => i.message).join(", ");
        return res.status(400).json({ message, missingParams: error.details[0].message, status: 400, success: false });
    }

    const subscription = await prisma.subscription.findFirst({
        where: { userId: req.user.id, sub_status: 1 },
        include: { plan: true },
    });

    if (!subscription) return createErrorResponse(res, 404, MessageEnum.NO_SUBSCRIPTION);

    const newPlan = await prisma.plan.findUnique({ where: { id: parseInt(newPlanId) } });
    if (!newPlan) return createErrorResponse(res, 404, MessageEnum.INVALID_PLAN);
    if (!newPlan.stripePriceId) return createErrorResponse(res, 400, "This plan is currently disabled");
    if (newPlan.maxStaffUsers < subscription.plan.maxStaffUsers) return createErrorResponse(res, 400, MessageEnum.DOWNGRADE_NOT_AVAILABLE);

    try {
        const subscriptionData = await stripeCurrent.subscriptions.retrieve(subscription.stripeSubscriptionId);
        const currentItem = subscriptionData.items.data[0].id;

        await stripeCurrent.subscriptions.update(subscription.stripeSubscriptionId, {
            items: [{ id: currentItem, price: newPlan.stripePriceId }],
            proration_behavior: "create_prorations",
            billing_cycle_anchor: "now",
        });

        return createSuccessResponse(res, 200, true, MessageEnum.SUBSCRIPTION_UPGRADED);
    } catch (error) {
        console.error("Upgrade failed:", error && (error.stack || error));
        // If stripe error contains request_log_url, log it for debugging
        try {
            if (error && error.raw && error.raw.request_log_url) console.error("Stripe request_log_url:", error.raw.request_log_url);
        } catch (e) { /* ignore */ }
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
}

export async function buyNewPlan(req, res) {
    try {
        const { newPlanId } = req.body;

        // validation
        const schema = Joi.object({
            newPlanId: Joi.alternatives().try(
                Joi.number().integer(),
                Joi.object({ id: Joi.number().integer().required() }).unknown(true)
            ).required(),
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

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return createErrorResponse(res, 404, MessageEnum.CUSTOMER_ID_NOT_FOUND);
        }

        const planId = typeof newPlanId === "object" ? newPlanId.id : newPlanId;
        const newPlan = await prisma.plan.findUnique({ where: { id: parseInt(planId) } });
        if (!newPlan) {
            return createErrorResponse(res, 404, MessageEnum.INVALID_PLAN);
        }
        if (!newPlan.stripePriceId) {
            return createErrorResponse(res, 400, "This plan is currently disabled");
        }

        console.log("buyNewPlan called by user:", user.id, "storedStripeCustomerId:", user.stripeCustomerId);

        // Ensure a Stripe customer exists
        const customer = await getOrCreateStripeCustomer(user);
        console.log("Stripe customer ready:", customer.id);

        // Refresh customer to get invoice_settings
        let defaultPaymentMethod = null;
        try {
            const freshCustomer = await stripeCurrent.customers.retrieve(customer.id);
            defaultPaymentMethod = freshCustomer.invoice_settings?.default_payment_method || null;
        } catch (custErr) {
            console.error("Failed to retrieve fresh stripe customer:", custErr?.message || custErr);
        }

        // -------------------------------
        // CASE 1: No default payment method
        // → use INVOICE flow (send_invoice)
        // -------------------------------
        if (!defaultPaymentMethod) {
            console.log("No default payment method. Creating INVOICE-based subscription for user:", user.id);

            const subscription = await stripeCurrent.subscriptions.create({
                customer: customer.id,
                items: [{ price: newPlan.stripePriceId }],
                collection_method: "send_invoice",
                days_until_due: 7, // jitne din tak user ko pay karna hai
                // metadata: { appUserId: user.id.toString(), planId: newPlan.id.toString() },
            });

            // TODO: yahan apne DB me subscription entry create/update karni hai
            // await prisma.subscription.create({ ... });

            return res.status(200).json({
                status: 200,
                success: true,
                invoiceFlow: true,
                message:
                    "Invoice created and sent to your email. Please complete payment to activate your subscription.",
                data: {
                    subscriptionId: subscription.id,
                    stripeStatus: subscription.status,
                },
            });
        }

        // -------------------------------
        // CASE 2: default payment method present
        // → normal card-based subscription
        // -------------------------------
        const subscription = await stripeCurrent.subscriptions.create({
            customer: customer.id,
            items: [{ price: newPlan.stripePriceId }],
            default_payment_method: defaultPaymentMethod,
            payment_behavior: "default_incomplete",
            expand: ["latest_invoice.payment_intent"],
        });

        const paymentIntent = subscription.latest_invoice?.payment_intent;
        console.log("subscription created. paymentIntent:", paymentIntent?.status || null);

        // If PaymentIntent requires action / confirmation, send clientSecret to frontend
        if (
            paymentIntent &&
            (paymentIntent.status === "requires_action" ||
                paymentIntent.status === "requires_confirmation")
        ) {
            return res.status(200).json({
                status: 200,
                success: false,
                actionRequired: true,
                message: "Additional action required to confirm payment",
                clientSecret: paymentIntent.client_secret,
                paymentIntentStatus: paymentIntent.status,
            });
        }

        // If succeeded or no extra action required
        return res.status(200).json({
            status: 200,
            success: true,
            message: "Subscription created successfully",
            data: { subscriptionId: subscription.id },
        });
    } catch (error) {
        console.error("buyNewPlan error:", error && (error.stack || error));

        try {
            if (error && error.raw) {
                if (error.raw.request_log_url) console.error("Stripe request_log_url:", error.raw.request_log_url);
                if (error.raw.code) console.error("Stripe code:", error.raw.code);
            }
        } catch (logErr) {
            console.warn("Failed to extract Stripe metadata:", logErr && (logErr.stack || logErr));
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            status: 500,
            error: (error && error.message) || String(error),
        });
    }
}



export async function getMySubscriptionHistory(req, res) {
    try {
        const subscription = await prisma.subscriptionHistory.findMany({
            where: { userId: req.user.id },
            include: { plan: true },
            orderBy: { created_at: "desc" },
        });
        return createSuccessResponse(res, 200, true, MessageEnum.SUBSCRIPTION_DATA, subscription);
    } catch (error) {
        console.error("getMySubscriptionHistory error:", error && (error.stack || error));
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
}
