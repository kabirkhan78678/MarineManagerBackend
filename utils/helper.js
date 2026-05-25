import crypto from 'crypto';
import { customAlphabet } from "nanoid"
import { PrismaClient } from '@prisma/client';
import axios from 'axios'
import qs from 'qs';
import base64url from 'base64url'
import moment from 'moment-timezone';
import { sendEmail } from './sendMail.js';
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

export function randomStringAsBase64Url(size) {
  return base64url(crypto.randomBytes(size));
}

export async function generateOTP(length = 4) {
  const chars = "0123456789";
  let OTP = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    OTP += chars.charAt(randomIndex);
  }

  return OTP;
}

export const getDateRanges = (timeZone) => {
  if (timeZone) {
    timeZone = timeZone
  }
  else {
    timeZone = 'Asia/Kolkata';
  }
  const startOfToday = moment.tz(timeZone).startOf('day');
  const endOfToday = moment.tz(timeZone).endOf('day');
  const startOfTomorrow = moment.tz(timeZone).add(1, 'days').startOf('day');
  const endOfTomorrow = moment.tz(timeZone).add(1, 'days').endOf('day'); // End of tomorrow
  const startOfYesterday = moment.tz(timeZone).subtract(1, 'days').startOf('day')
  const endOfYesterday = moment.tz(timeZone).subtract(1, 'days').endOf('day')
  const endOfThirtyDays = moment.tz(timeZone).add(30, 'days').endOf('day');

  return {
    startOfToday,
    endOfToday,
    startOfTomorrow,
    endOfTomorrow,
    startOfYesterday,
    endOfYesterday,
    endOfThirtyDays
  };
};

const USER_COUNT_SNAPSHOT_TABLE = 'admin_user_count_snapshots';
let userCountSnapshotTableReadyPromise = null;

function normalizeCountValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getUserCountSnapshotDateString(offsetDays = 0, timeZone = 'Asia/Kolkata') {
  return moment.tz(timeZone).add(offsetDays, 'days').format('YYYY-MM-DD');
}

export async function ensureUserCountSnapshotTable() {
  if (!userCountSnapshotTableReadyPromise) {
    userCountSnapshotTableReadyPromise = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`${USER_COUNT_SNAPSHOT_TABLE}\` (
        id INT NOT NULL AUTO_INCREMENT,
        snapshot_date DATE NOT NULL,
        total_user INT NOT NULL DEFAULT 0,
        total_client INT NOT NULL DEFAULT 0,
        total_technician INT NOT NULL DEFAULT 0,
        total_supplier INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY admin_user_count_snapshots_snapshot_date_key (snapshot_date)
      )
    `);
  }

  await userCountSnapshotTableReadyPromise;
}

async function getCurrentUserCounts() {
  const [totalClient, totalTechnician, totalSupplier] = await Promise.all([
    prisma.user.count(),
    prisma.staff_Member.count(),
    prisma.supplier.count(),
  ]);

  return {
    total_user: totalClient + totalTechnician + totalSupplier,
    total_client: totalClient,
    total_technician: totalTechnician,
    total_supplier: totalSupplier,
  };
}

export async function captureUserCountSnapshot(snapshotDate = getUserCountSnapshotDateString()) {
  await ensureUserCountSnapshotTable();

  const counts = await getCurrentUserCounts();

  await prisma.$executeRaw`
    INSERT INTO admin_user_count_snapshots (
      snapshot_date,
      total_user,
      total_client,
      total_technician,
      total_supplier
    ) VALUES (
      ${snapshotDate},
      ${counts.total_user},
      ${counts.total_client},
      ${counts.total_technician},
      ${counts.total_supplier}
    )
    ON DUPLICATE KEY UPDATE
      total_user = VALUES(total_user),
      total_client = VALUES(total_client),
      total_technician = VALUES(total_technician),
      total_supplier = VALUES(total_supplier)
  `;

  return counts;
}

export async function getLatestUserCountSnapshotBefore(snapshotDate = getUserCountSnapshotDateString()) {
  await ensureUserCountSnapshotTable();

  const rows = await prisma.$queryRaw`
    SELECT
      snapshot_date,
      total_user,
      total_client,
      total_technician,
      total_supplier
    FROM admin_user_count_snapshots
    WHERE snapshot_date < ${snapshotDate}
    ORDER BY snapshot_date DESC
    LIMIT 1
  `;

  const snapshot = rows?.[0];
  if (!snapshot) return null;

  return {
    snapshot_date: snapshot.snapshot_date,
    total_user: normalizeCountValue(snapshot.total_user),
    total_client: normalizeCountValue(snapshot.total_client),
    total_technician: normalizeCountValue(snapshot.total_technician),
    total_supplier: normalizeCountValue(snapshot.total_supplier),
  };
}

export async function getUserCountSnapshotsBefore(
  snapshotDate = getUserCountSnapshotDateString(),
  limit = 2,
) {
  await ensureUserCountSnapshotTable();

  const safeLimit = Math.max(1, Number(limit) || 1);
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        snapshot_date,
        total_user,
        total_client,
        total_technician,
        total_supplier
      FROM admin_user_count_snapshots
      WHERE snapshot_date < ?
      ORDER BY snapshot_date DESC
      LIMIT ${safeLimit}
    `,
    snapshotDate,
  );

  return (rows || []).map((snapshot) => ({
    snapshot_date: snapshot.snapshot_date,
    total_user: normalizeCountValue(snapshot.total_user),
    total_client: normalizeCountValue(snapshot.total_client),
    total_technician: normalizeCountValue(snapshot.total_technician),
    total_supplier: normalizeCountValue(snapshot.total_supplier),
  }));
}

export const sendTaskReminders = async () => {
  try {
    // Calculate tomorrow's date
    const tomorrowStart = moment().add(1, "days").startOf("day").toDate();
    const tomorrowEnd = moment().add(1, "days").endOf("day").toDate();

    // Fetch tasks ending tomorrow that are not completed
    const tasksEndingTomorrow = await prisma.task.findMany({
      where: {
        date_scheduled_to: {
          gte: tomorrowStart,
          lte: tomorrowEnd,
        },
        completed_at: null,
        status: {
          not: 1
        } // Ensure the task is not completed
      },
      include: {
        staff: true, // Include staff member details
        boat: true,
      },
    });

    if (tasksEndingTomorrow.length === 0) {
      console.log("No tasks ending tomorrow to send reminders for.");
    }

    const emailPromises = tasksEndingTomorrow.map(async (task) => {
      const staffMember = task.staff;

      if (!staffMember) {
        console.warn(`No staff assigned for task ID: ${task.id}`);
        return Promise.resolve(); // Skip this task
      }

      const mailOptions = {
        from: "your-email@example.com",
        to: staffMember.email,
        subject: "Reminder: Task Ending Tomorrow",
        template: "taskRemainder", // Assuming you have a template named 'taskReminder'
        context: {
          TASK_NAME: task.description,
          BOAT_NAME: task.boat.name,
          TASK_END_DATE: moment(task.date_scheduled_to).format("MMMM Do YYYY"),
        },
      };

      // Return the sendEmail promise
      return sendEmail(mailOptions).then(() => {
        console.log(`Reminder email sent to ${staffMember.email} for task ID: ${task.id}`);
      });
    });


    await Promise.all(emailPromises);

    console.log("Reminder emails sent successfully.");

  } catch (error) {
    console.error("Error while sending reminder emails:", error)
  }
};

export const deleteExpiredBookings = async () => {
  try {


    const { startOfToday } = getDateRanges();

    const deletedBookings = await prisma.dockBooking.deleteMany({
      where: {
        book_to: {
          lt: startOfToday, // Less than today's start
        },
      },
    });

    console.log(`Deleted ${deletedBookings.count} expired dock bookings.`);
  } catch (error) {
    console.error('Error deleting expired dock bookings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

export async function generateRandomUICNumber() {
  const digits = '0123456789';
  const nanoid = customAlphabet(digits, 8);
  return nanoid();
}

export async function deleteExpiredTrailsAndSubscriptions() {
  const { startOfToday } = getDateRanges();

  // Find all userIds with expired subscriptions
  const expiredSubscriptions = await prisma.subscription.findMany({
    where: {
      sub_status: 3,
      OR: [
        { trial_end_date: { lt: startOfToday } }, // Expired trial
        { renewed_at: { lt: startOfToday } } // Expired paid plan
      ]
    },
    select: { userId: true }
  });

  if (expiredSubscriptions.length > 0) {
    const userIds = expiredSubscriptions.map(sub => sub.userId);

    // Move expired subscriptions to history before deleting
    const historyData = expiredSubscriptions.map(sub => ({
      planId: sub.planId,
      userId: sub.userId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripeCustomerId: sub.stripeCustomerId,
      renewed_at: sub.renewed_at,
      sub_status: sub.sub_status,
      trial_end_date: sub.trial_end_date,
      start_date: sub.start_date,
      canceled_at: sub.canceled_at
    }));

    await prisma.subscriptionHistory.createMany({
      data: historyData
    });

    // Delete expired subscriptions
    await prisma.subscription.deleteMany({
      where: { userId: { in: userIds } }
    });

    // Update staff deactivation status
    await prisma.staff_Member.updateMany({
      where: { userId: { in: userIds } },
      data: { system_deactivation_status: 0 }
    });

    console.log("Expired subscriptions moved to history and deleted, staff deactivated.");
  }
}

export async function deletFailedPaymentSubscriptions() {
  const { startOfToday } = getDateRanges();

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Find all userIds with failed subscriptions
  const failedSubscriptions = await prisma.subscription.findMany({
    where: {
      sub_status: 0,
      failed_at: { lt: threeDaysAgo }
    },
    select: { userId: true }
  });

  const userIds = failedSubscriptions.map(sub => sub.userId);

  if (userIds.length > 0) {
    // Update staff members linked to those users
    await prisma.staff_Member.updateMany({
      where: { userId: { in: userIds } },
      data: { system_deactivation_status: 0 }
    });

    // Delete failed subscriptions
    await prisma.subscription.deleteMany({
      where: { userId: { in: userIds } }
    });

    console.log("Failed payment subscriptions removed, staff deactivated.");
  }
}

export async function findTrailOrSubscription(userId) {

  const trail_sub = await prisma.subscription.findUnique({
    where: {
      userId: parseInt(userId)
    },
    include: {
      plan: true
    }
  })
  return trail_sub;
}

export async function getValidAccessTokenForAdmin(adminId) {
  const user = await prisma.user.findUnique({
    where: {
      id: adminId
    }
  }); 
  const CLIENT_ID = process.env.XERO_CLIENT_ID ;
  const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET; 
  if (isAccessTokenExpired(user.xero_expiresAt)) {
    const refreshed = await refreshAccessToken(user.xero_refresh_token, CLIENT_ID, CLIENT_SECRET);
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await prisma.user.update({
      where:{
        id:adminId
      },
      data:{
        xero_access_token:refreshed.access_token,
        xero_refresh_token:refreshed.refresh_token,
        xero_expiresAt:expiresAt
      }
    })
    return refreshed.access_token;
  }

  return user.xero_access_token;
}

function isAccessTokenExpired(expiresAt) {
  return Date.now() >= new Date(expiresAt).getTime();
}

async function refreshAccessToken(refresh_token, client_id, client_secret) {
  const tokenUrl = "https://identity.xero.com/connect/token";

  const data = qs.stringify({
    grant_type: "refresh_token",
    refresh_token: refresh_token,
  });

  const headers = {
    Authorization: "Basic " + Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    const response = await axios.post(tokenUrl, data, { headers });

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token, // this is new too, update it in DB
      expires_in: response.data.expires_in,
    };
  } catch (error) {
    console.error("Error refreshing Xero access token:", error.response?.data || error);
    throw new Error("Unable to refresh token");
  }
}
