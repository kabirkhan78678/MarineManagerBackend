import express from 'express';
import { userRouter } from './routes/userRouter.js'
import cors from 'cors'
import cron from "node-cron";
import https from 'https';
import fs from 'fs';
import { staffRouter } from './routes/staffRouter.js';
import { supplierRouter } from './routes/supplierRouter.js';
import { boatRouter } from './routes/boatRouter.js';
import { QuickLeadsRouter } from './routes/QuickLeadsRouter.js';
import { dockRouter } from './routes/dockRouter.js';
import { homeRouter } from './routes/homeRouter.js';
import { taskRouter } from './routes/taskRouter.js';
import { serviceRouter } from './routes/serviceRouter.js';
import { PrismaClient } from '@prisma/client';
import {
  captureUserCountSnapshot,
  deleteExpiredBookings,
  deleteExpiredTrailsAndSubscriptions,
  deletFailedPaymentSubscriptions,
  getDateRanges,
  sendTaskReminders,
} from './utils/helper.js';
import { notificationRouter } from './routes/notification.js';
import { invoiceRouter } from './routes/invoiceRouter.js';
import Stripe from "stripe";
import { subscriptionRouter } from './routes/susbcriptionRouter.js';
import xeroRouter from './routes/xeroRouter.js';
import { adminRouter } from './routes/adminRouter.js';
const stripe = new Stripe("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");

// MVP1 Ventures
import { createProxyMiddleware } from "http-proxy-middleware";


const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4005;

// MVP1 Ventures
const n8nApiURL = process.env.N8N_URL;

// const allowedOrigins = [
//   "http://localhost:5173",
//   "http://localhost:3000",
//   "http://192.168.1.11:3000",
//   "http://192.168.1.11",
//   "https://creativethoughtsinfo.com"
// ];

app.use(cors({
  origin: true,
  credentials: true
}));


//const webhookSecret = 'whsec_26d8f5d4fc992a5509d791e5e5602d8167876013ac1b7035ad8023dcd2ca2781';
const webhookSecret = 'whsec_Iz8xPtw6oc6BCvgsZIBn6SNXFyQoJkdb';
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { startOfToday } = getDateRanges()

  switch (event.type) {

    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;
      const amountPaid = invoice.amount_paid / 100;

      console.log("amountPaid", amountPaid);

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      console.log("subscription", subscription);


      const periodEnd = invoice.lines?.data?.[0]?.period?.end;
      let nextBillingDate = '';
      if (periodEnd) {
        const timestamp = typeof periodEnd === "string" ? parseInt(periodEnd) : periodEnd;
        nextBillingDate = new Date(timestamp * 1000);
        console.log("Raw periodEnd:", periodEnd);
        console.log("nextBillingDate:", nextBillingDate);
      } else {
        console.log("No period end available in invoice");
      }


      // Extract next billing date (in UNIX timestamp) and convert it to JS Date
      //const nextBillingDate = new Date(subscription.current_period_end * 1000);

      if (amountPaid === 0) {
        console.log(`Ignoring trial invoice for subscription ${subscriptionId}`);
        return;
      }

      console.log("subscriptionId", subscriptionId);
      console.log("nextBillingDate", nextBillingDate);
      console.log("customerId.", customerId);
      const subscriptionUpdate = await prisma.subscription.findUnique({
        where: {
          stripeSubscriptionId: subscriptionId
        }
      })
      if (subscriptionUpdate) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { sub_status: 1, renewed_at: nextBillingDate, trial_end_date: null },
        });
      }
      else {
        const user = await prisma.user.findFirst({
          where: {
            stripeCustomerId: customerId
          }
        })
        const subscriptionDataOld = await prisma.subscription.findUnique({
          where: {
            userId: user.id
          }
        })
        if (subscriptionDataOld) {
          await prisma.subscriptionHistory.create({
            data: {
              planId: subscriptionDataOld.planId,
              userId: subscriptionDataOld.userId,
              stripeSubscriptionId: subscriptionDataOld.stripeSubscriptionId,
              stripeCustomerId: subscriptionDataOld.stripeCustomerId,
              renewed_at: subscriptionDataOld.renewed_at,
              sub_status: subscriptionDataOld.sub_status,
              trial_end_date: subscriptionDataOld.trial_end_date,
              start_date: subscriptionDataOld.start_date,
              canceled_at: startOfToday
            }
          })
          await prisma.subscription.delete({
            where: {
              id: subscriptionDataOld.id
            }
          })
        }
        const newPriceId = subscription.items.data[0].price.id
        const newPlan = await prisma.plan.findUnique({
          where: { stripePriceId: newPriceId }
        });

        if (!newPlan) {
          console.error("❌ Stripe price not mapped in DB:", newPriceId);

          // OPTIONAL: notify admin / log to file
          return; // prevents server crash
        }


        await prisma.subscription.create({
          data: {
            planId: newPlan.id,
            stripeCustomerId: customerId,
            userId: user.id,
            stripeSubscriptionId: subscriptionId,
            start_date: startOfToday,
            sub_status: 1,
            renewed_at: nextBillingDate // Trial Mode
          },
        });
      }
      console.log(`Payment successful for subscription ${subscriptionId}.`);
      break;
    }

    case "invoice.payment_failed": {
      const failedInvoice = event.data.object;
      const failedCustomerId = failedInvoice.customer;

      // Update user status in database
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: failedInvoice.subscription },
        data: { sub_status: 0, failed_at: startOfToday },
      });
      console.log("failedInvoice", failedInvoice.subscription);
      console.log("failedCustomerId", failedCustomerId);
      console.log("Payment failed. Subscription is inactive.");
      break;
    }

    case "customer.subscription.deleted": {
      const deletedSubscription = event.data.object;
      console.log(`Subscription ${deletedSubscription.id} was canceled.`);

      // Update the database to mark the subscription as canceled
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: deletedSubscription.id },
        data: { sub_status: 3, canceled_at: startOfToday },
      });

      break;
    }

    case "customer.subscription.updated": {
      const subscriptionUpdate = event.data.object;
      const customerId = subscriptionUpdate.customer; // Stripe Customer ID
      const subscriptionId = subscriptionUpdate.id; // Stripe Subscription ID
      const nextBillingDate = new Date(subscriptionUpdate.current_period_end * 1000); // Convert Unix timestamp to JS Date

      console.log("🔄 Subscription Updated:", {
        customerId,
        subscriptionId,
        nextBillingDate,
      });

      const newPriceId = subscriptionUpdate.items.data[0].price.id;
      if (!newPriceId) {
        console.error("❌ No price ID found in subscription update");
        break;
      }
      const newPlan = await prisma.plan.findUnique({
        where: { stripePriceId: newPriceId }
      });
      if (!newPlan) {
        console.error("❌ Plan not found for price:", newPriceId);
        break;
      }

      const existingSubscription = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId }
      });

      if (existingSubscription?.stripeSubscriptionId === subscriptionId) {
        // Move old subscription to history before updating
        console.log("upgrading the plan now >>>>>>>>>>")
        await prisma.subscriptionHistory.create({
          data: {
            planId: existingSubscription.planId,
            userId: existingSubscription.userId,
            stripeSubscriptionId: existingSubscription.stripeSubscriptionId,
            stripeCustomerId: existingSubscription.stripeCustomerId,
            renewed_at: existingSubscription.renewed_at,
            sub_status: existingSubscription.sub_status,
            trial_end_date: existingSubscription.trial_end_date,
            start_date: existingSubscription.start_date,
            canceled_at: startOfToday
          }
        });

        // Update the existing subscription
        await prisma.subscription.update({
          where: { stripeCustomerId: customerId },
          data: {
            planId: newPlan.id,
            renewed_at: nextBillingDate,
            sub_status: 1,
            trial_end_date: null
          }
        });
      } else {
        console.log("Skipping update since this is a new subscription purchase.");
      }

      break;
    }
  }

  return res.status(200).json({ received: true });
});


// app.use(express.json());

app.use(express.json({ limit: '200mb' }));

app.use(
  express.urlencoded({
    limit: '20mb',
    extended: true,
  })
);

// MVP1 Ventures
app.use(
  "/n8n-api",
  createProxyMiddleware({
    target: n8nApiURL,
    changeOrigin: true,
    pathRewrite: { "^/n8n-api": "" },
    onProxyReq: (proxyReq, req, res) => {
      // Optional: Log requests for debugging
      console.log(`Proxying request: ${req.url}`);
    }
  })
);

cron.schedule("0 0 * * *", async () => {
  console.log("Running the task reminder job...");

  try {
    await captureUserCountSnapshot();
    console.log("Running task reminder cron job...");
    const result = await sendTaskReminders();
    await deleteExpiredBookings();
    await deleteExpiredTrailsAndSubscriptions();
    await deletFailedPaymentSubscriptions();
    // console.log(result.message);
  } catch (error) {
    console.error("Error while sending reminder emails:", error);
  }
});

app.use(express.static('public'));
app.use('/users', userRouter);
app.use('/staff', staffRouter);
app.use('/supplier', supplierRouter);
app.use('/boat', boatRouter);
app.use('/quickLeads', QuickLeadsRouter);
app.use('/dock', dockRouter);
app.use('/task', taskRouter)
app.use('/home', homeRouter);
app.use('/notification', notificationRouter);
app.use('/invoice', invoiceRouter);
app.use('/subscription', subscriptionRouter);
app.use('/services', serviceRouter);
app.use('/xero', xeroRouter);
app.use('/admin', adminRouter);

// MVP1 Ventures Commented - Start
// app.get("/", (req, res) => {
//   console.log("here>>>>>>>>>>>>>>>>>>")
//   res.setHeader("Access-Control-Allow-Origin", "*", "http://3.26.177.93:4000/", {
//     reconnect: true,
//   });
//   res.header("Access-Control-Allow-Credentials", true);
//   res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,PUT,OPTIONS");
//   res.setHeader(
//     "Access-Control-Allow-Headers",
//     "Content-Type,Accept, X-Custom-Header,Authorization"
//   );

//   if (req.method === "OPTIONS") {
//     return res.status(200).end();
//   } else {
//     return res.send({ success: "0", message: "You are connected to Marine Manager Backend" });
//   }
// });

// const sslOptions = {
//   ca: fs.readFileSync("/var/www/html/ssl/ca_bundle.crt"),
//   key: fs.readFileSync("/var/www/html/ssl/private.key"),
//   cert: fs.readFileSync("/var/www/html/ssl/certificate.crt"),
// };

// const httpsServer = https.createServer(sslOptions, app);
// MVP1 Ventures Commented - End

app.listen(PORT, () => {
  console.log(`Node app is running on port ${PORT}`);
})
