import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { fileURLToPath } from 'url';
import hbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import path from 'path';
import dotenv from 'dotenv';
import Stripe from "stripe";
import {
  getDateRanges,
  randomStringAsBase64Url,
} from '../utils/helper.js';

dotenv.config();

const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_BLOCKED_MARKER = "ADMIN_BLOCKED::";
const stripe = new Stripe(
  "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",
  { apiVersion: "2022-11-15" }
);

const transporter = nodemailer.createTransport({
  host: "email-smtp.ap-southeast-2.amazonaws.com",
  port: 465,
  auth: {
    user: "AKIATRNH4WSLN3EJRKHX",
    pass: "BGInerDiW6ZTl62fSQ45ueA2Eg8pZ1G/Si1FAOH+9t5f",
  },
  tls: {
    rejectUnauthorized: false,
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

function removeSensitiveAdminFields(admin) {
  if (!admin) return admin;
  const { password, token, ...safeAdmin } = admin;
  return withAdminProfileImageUrl(safeAdmin);
}

function getProfileImageUrl(profileImage) {
  if (!profileImage) return null;
  if (/^https?:\/\//i.test(profileImage)) return profileImage;
  return `${baseurl}/profile/${profileImage}`;
}

function withAdminProfileImageUrl(admin) {
  if (!admin) return admin;
  return {
    ...admin,
    profile_image: getProfileImageUrl(admin.profile_image),
  };
}

function getProfileImageFromRequest(req, profileImage) {
  if (req.file?.filename) return req.file.filename;
  if (profileImage !== undefined) return profileImage || null;
  return undefined;
}

function normalizeManagedUserType(type) {
  return type?.toString().trim().toUpperCase();
}

function encodeOwnerBlockedToken(user) {
  const existingBlockedMeta = decodeOwnerBlockedToken(user?.act_token);
  const originalToken = existingBlockedMeta ? (existingBlockedMeta.originalToken || "") : (user?.act_token || "");
  const wasVerified = existingBlockedMeta ? existingBlockedMeta.wasVerified : Boolean(user?.isVerified);
  const encodedToken = Buffer.from(originalToken, "utf8").toString("base64");
  return `${ADMIN_BLOCKED_MARKER}${wasVerified ? "1" : "0"}::${encodedToken}`;
}

function decodeOwnerBlockedToken(actToken) {
  if (!actToken || typeof actToken !== "string" || !actToken.startsWith(ADMIN_BLOCKED_MARKER)) {
    return null;
  }

  const payload = actToken.slice(ADMIN_BLOCKED_MARKER.length);
  const separatorIndex = payload.indexOf("::");
  if (separatorIndex === -1) {
    return null;
  }

  const wasVerified = payload.slice(0, separatorIndex) === "1";
  const encodedToken = payload.slice(separatorIndex + 2);
  const originalToken = encodedToken ? Buffer.from(encodedToken, "base64").toString("utf8") : null;
  const nestedBlockedMeta = originalToken ? decodeOwnerBlockedToken(originalToken) : null;

  return {
    wasVerified: nestedBlockedMeta ? nestedBlockedMeta.wasVerified : wasVerified,
    originalToken: nestedBlockedMeta ? nestedBlockedMeta.originalToken : originalToken,
  };
}

function isOwnerBlocked(user) {
  return Boolean(decodeOwnerBlockedToken(user?.act_token));
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

function getAssignedToLabel(task) {
  if (task.assign_to === "STAFF") {
    return task.staff?.full_name || "Staff";
  }

  return task.supplier?.name || task.supplier?.company_name || "Outsourced";
}

function getAssignedDockName(bookings) {
  const now = new Date();
  const activeBooking = bookings.find((booking) => booking.book_from <= now && booking.book_to >= now);
  return activeBooking?.dock?.name || null;
}

function formatJobResponse(task) {
  const assignedDock = getAssignedDockName(task.boat?.DockBooking || []);
  const ownerName = task.boat?.owners_name || null;
  const ownerEmail = task.boat?.email || null;
  const ownerContact = task.boat?.phone_no || null;
  const assignedTo = getAssignedToLabel(task);
  const jobStatus = getTaskJobStatus(task);
  const primaryJobSheet = task.JobServiceSheet?.[0] || null;

  return {
    id: task.id,
    job_id: task.jobNumber || task.id,
    boat_name: task.boat?.name || null,
    owner_name: ownerName,
    assigned_to: assignedTo,
    services: task.description || null,
    cost: task.quoted_value || null,
    status: jobStatus,
    assigned_dock: assignedDock,
    start_from: task.date_scheduled_from,
    end_to: task.date_scheduled_to,
    email: ownerEmail,
    contact: ownerContact,
    technician: task.staff
      ? {
        name: task.staff.full_name,
        service_name: task.description || null,
        cost: task.quoted_value || null,
      }
      : null,
    supplier: task.supplier
      ? {
        name: task.supplier.name || task.supplier.company_name || null,
        service_name: task.description || null,
        cost: task.quoted_value || null,
      }
      : null,
    job_service_sheet: primaryJobSheet
      ? {
        id: primaryJobSheet.id,
        job_number: primaryJobSheet.jobNumber,
        date: primaryJobSheet.date,
        person_attending: primaryJobSheet.personAttending,
        customer_name: primaryJobSheet.customerName,
        mobile: primaryJobSheet.mobile,
        work_to_be_carried_out: primaryJobSheet.workToBeCarriedOut,
        work_carried_out: primaryJobSheet.workCarriedOut,
        document_link: primaryJobSheet.documentLink,
      }
      : null,
  };
}

function formatJobListResponse(task) {
  const job = formatJobResponse(task);

  return {
    id: job.id,
    job_id: job.job_id,
    boat_name: job.boat_name,
    owner: job.owner_name,
    assigned_to: job.assigned_to,
    services: job.services,
    cost: job.cost,
    status: job.status,
  };
}

function getUserStatusLabel(isActive) {
  return isActive ? "active" : "inactive";
}

function getOwnerDisplayName(user) {
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return fullName || user.company_name || user.email;
}

function getSupplierDisplayName(supplier) {
  const fullName = `${supplier.first_name || ""} ${supplier.last_name || ""}`.trim();
  return fullName || supplier.company_name || supplier.email;
}

function getSupplierBasePortName(supplier) {
  return supplier?.service_region || supplier?.city || null;
}

function getPublicProfileFileUrl(fileName) {
  if (!fileName) return null;
  return `${baseurl}/profile/${fileName}`;
}

function splitServicesOffered(value) {
  if (!value) return [];
  return String(value)
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getJobHistoryStatus(task) {
  const status = getTaskJobStatus(task);
  if (status === "assigned") return "pending";
  return status;
}

function getLatestOrActiveBooking(bookings = []) {
  const now = new Date();
  const activeBooking = bookings.find((booking) => booking.book_from <= now && booking.book_to >= now);

  if (activeBooking) {
    return {
      booking: activeBooking,
      isActive: true,
    };
  }

  const latestBooking = [...bookings].sort((a, b) => new Date(b.book_from) - new Date(a.book_from))[0] || null;

  return {
    booking: latestBooking,
    isActive: false,
  };
}


function formatOwnerListItem(user) {
  return {
    id: user.id,
    username: getOwnerDisplayName(user),
    user_type: "OWNER",
    email: user.email,
    date_joined: user.createdAt,
    status: getUserStatusLabel(user.isVerified),
  };
}

function formatTechnicianListItem(user) {
  return {
    id: user.id,
    username: user.full_name,
    user_type: "TECHNICIAN",
    email: user.email,
    date_joined: user.createdAt,
    status: getUserStatusLabel(user.status === 1),
  };
}

function formatSupplierListItem(user) {
  return {
    id: user.id,
    username: getSupplierDisplayName(user),
    user_type: "SUPPLIER",
    email: user.email,
    base_port_name: getSupplierBasePortName(user),
    date_joined: user.createdAt,
    status: getUserStatusLabel(user.status === 1),
  };
}

function toSafeNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatMetricValue(value, decimals = 0) {
  const safeValue = toSafeNumber(value);
  if (decimals === 0) {
    return Math.round(safeValue);
  }

  return Number(safeValue.toFixed(decimals));
}

function buildUnavailableDashboardComparison(label = "Comparison unavailable") {
  return {
    comparison_available: false,
    previous_value: null,
    change_value: null,
    change_percentage: null,
    direction: "neutral",
    label,
  };
}

function buildDashboardComparison(currentValue, previousValue, options = {}) {
  if (previousValue === null || previousValue === undefined) {
    return buildUnavailableDashboardComparison(options.unavailableLabel);
  }

  const decimals = options.decimals ?? 0;
  const current = toSafeNumber(currentValue);
  const previous = toSafeNumber(previousValue);
  const difference = current - previous;
  const direction = difference > 0 ? "up" : difference < 0 ? "down" : "neutral";
  const rawPercentage = previous === 0
    ? (current === 0 ? 0 : 100)
    : Math.abs((difference / previous) * 100);
  const percentage = direction === "down" ? -rawPercentage : rawPercentage;

  let label = "No change from yesterday";
  if (direction === "up") label = options.upLabel || "Up from yesterday";
  if (direction === "down") label = options.downLabel || "Down from yesterday";

  return {
    comparison_available: true,
    previous_value: formatMetricValue(previous, decimals),
    change_value: formatMetricValue(difference, decimals),
    change_percentage: formatMetricValue(percentage, 2),
    direction,
    label,
  };
}

function buildDashboardCard(key, title, value, comparison, options = {}) {
  return {
    key,
    title,
    value: formatMetricValue(value, options.decimals ?? 0),
    comparison,
  };
}

function getSubscriptionEventDate(subscription) {
  return subscription.renewed_at || subscription.start_date || subscription.created_at || null;
}

function buildSubscriptionHistoryGraph(currentSubscriptions = [], historySubscriptions = [], totalMonths = 12) {
  const monthFormatter = new Intl.DateTimeFormat("en", {
    month: "short",
    timeZone: "UTC",
  });
  const now = new Date();
  const buckets = [];

  for (let index = totalMonths - 1; index >= 0; index -= 1) {
    const bucketDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const key = `${bucketDate.getUTCFullYear()}-${String(bucketDate.getUTCMonth() + 1).padStart(2, "0")}`;

    buckets.push({
      key,
      label: monthFormatter.format(bucketDate),
      month: bucketDate.getUTCMonth() + 1,
      year: bucketDate.getUTCFullYear(),
      total_subscriptions: 0,
      active_subscriptions: 0,
      canceled_subscriptions: 0,
      expired_subscriptions: 0,
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const allSubscriptions = [...currentSubscriptions, ...historySubscriptions];

  allSubscriptions.forEach((subscription) => {
    const eventDate = getSubscriptionEventDate(subscription);
    if (!eventDate) return;

    const event = new Date(eventDate);
    const bucketKey = `${event.getUTCFullYear()}-${String(event.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = bucketMap.get(bucketKey);

    if (!bucket) return;

    const status = getSubscriptionStatusLabel(subscription);
    bucket.total_subscriptions += 1;

    if (status === "active") bucket.active_subscriptions += 1;
    if (status === "canceled") bucket.canceled_subscriptions += 1;
    if (status === "expired") bucket.expired_subscriptions += 1;
  });

  return buckets;
}

function getSupplierDetailSelect() {
  return {
    id: true,
    email: true,
    first_name: true,
    last_name: true,
    company_name: true,
    company_description: true,
    status: true,
    phone_no: true,
    city: true,
    company_logo: true,
    abn: true,
    trade_license: true,
    accounting_software_used: true,
    about_us: true,
    service_region: true,
    services_offered: true,
    complete_profile_status: true,
    createdAt: true,
    updatedAt: true,
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
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    },
    Task: {
      include: {
        boat: {
          select: {
            id: true,
            name: true,
            rego: true,
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
          },
        },
      },
      orderBy: [
        { date_scheduled_from: "desc" },
        { id: "desc" },
      ],
    },
  };
}

function getTechnicianDetailSelect() {
  return {
    id: true,
    email: true,
    role: true,
    full_name: true,
    home_address: true,
    userId: true,
    status: true,
    hourly_rate: true,
    system_deactivation_status: true,
    phone_no: true,
    createdAt: true,
    updatedAt: true,
    user: {
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        company_name: true,
        phone_no: true,
        company_logo: true,
      },
    },
    Task: {
      include: {
        boat: {
          select: {
            id: true,
            name: true,
            rego: true,
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
          },
        },
      },
      orderBy: [
        { date_scheduled_from: "desc" },
        { id: "desc" },
      ],
    },
  };
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

async function ensureSupplierOwnerLink({ supplierId, userId, fallbackName }) {
  if (!supplierId || !userId) return null;

  const ownerUser = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
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
  });

  if (!ownerUser) {
    return null;
  }

  await prisma.userSupplier.upsert({
    where: {
      userId_supplierId: {
        userId: ownerUser.id,
        supplierId: parseInt(supplierId),
      },
    },
    update: {
      name: fallbackName || getOwnerDisplayName(ownerUser),
    },
    create: {
      userId: ownerUser.id,
      supplierId: parseInt(supplierId),
      name: fallbackName || getOwnerDisplayName(ownerUser),
    },
  });

  return ownerUser;
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

function buildJobSummary(tasks) {
  return {
    total_jobs: tasks.length,
    in_progress_jobs: tasks.filter((task) => getTaskJobStatus(task) === "in progress").length,
    completed_jobs: tasks.filter((task) => getTaskJobStatus(task) === "completed").length,
  };
}

function buildJobHistory(tasks) {
  return tasks.map((task) => ({
    ...formatSupplierJobHistory(task),
  }));
}

function getOwnerDashboardSelect() {
  return {
    id: true,
    email: true,
    first_name: true,
    last_name: true,
    company_name: true,
    phone_no: true,
    abn: true,
    isVerified: true,
    company_logo: true,
    trade_license: true,
    accounting_software_used: true,
    about_us: true,
    service_region: true,
    services_offered: true,
    createdAt: true,
    updatedAt: true,
    InsuranceFile: {
      select: {
        id: true,
        filename: true,
      },
    },
    Boat: {
      include: {
        dockBooking: {
          include: {
            dock: true,
          },
          orderBy: {
            book_from: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    },
    Dock: {
      include: {
        dockBooking: {
          include: {
            boat: {
              select: {
                id: true,
                name: true,
                owners_name: true,
              },
            },
          },
          orderBy: {
            book_from: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    },
    Staff_Member: {
      select: {
        id: true,
        full_name: true,
        role: true,
        email: true,
        phone_no: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        id: "desc",
      },
    },
    UserSupplier: {
      include: {
        supplier: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
            company_description: true,
            phone_no: true,
            city: true,
            abn: true,
            status: true,
            accounting_software_used: true,
            about_us: true,
            services_offered: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    },
  };
}

async function getGlobalUserCounts() {
  const {
    startOfToday,
    endOfToday,
    startOfYesterday,
    endOfYesterday,
  } = getDateRanges();
  const startOfTodayDate = startOfToday.toDate();
  const endOfTodayDate = endOfToday.toDate();
  const startOfYesterdayDate = startOfYesterday.toDate();
  const endOfYesterdayDate = endOfYesterday.toDate();

  const [
    totalClient,
    totalClientTodayGrowth,
    totalClientYesterdayGrowth,
    totalTechnician,
    totalTechnicianTodayGrowth,
    totalTechnicianYesterdayGrowth,
    totalSupplier,
    totalSupplierTodayGrowth,
    totalSupplierYesterdayGrowth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        createdAt: {
          gte: startOfTodayDate,
          lte: endOfTodayDate,
        },
      },
    }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: startOfYesterdayDate,
          lte: endOfYesterdayDate,
        },
      },
    }),
    prisma.staff_Member.count(),
    prisma.staff_Member.count({
      where: {
        createdAt: {
          gte: startOfTodayDate,
          lte: endOfTodayDate,
        },
      },
    }),
    prisma.staff_Member.count({
      where: {
        createdAt: {
          gte: startOfYesterdayDate,
          lte: endOfYesterdayDate,
        },
      },
    }),
    prisma.supplier.count(),
    prisma.supplier.count({
      where: {
        createdAt: {
          gte: startOfTodayDate,
          lte: endOfTodayDate,
        },
      },
    }),
    prisma.supplier.count({
      where: {
        createdAt: {
          gte: startOfYesterdayDate,
          lte: endOfYesterdayDate,
        },
      },
    }),
  ]);

  const totalUser = totalClient + totalTechnician + totalSupplier;
  const totalUserTodayGrowth =
    totalClientTodayGrowth + totalTechnicianTodayGrowth + totalSupplierTodayGrowth;
  const totalUserYesterdayGrowth =
    totalClientYesterdayGrowth + totalTechnicianYesterdayGrowth + totalSupplierYesterdayGrowth;
  const overviewCards = [
    buildDashboardCard(
      "total_user",
      "Total User",
      totalUser,
      buildDashboardComparison(totalUserTodayGrowth, totalUserYesterdayGrowth, {
        upLabel: "Up for yesterday",
        downLabel: "Down for yesterday",
      }),
    ),
    buildDashboardCard(
      "total_client",
      "Total Client",
      totalClient,
      buildDashboardComparison(totalClientTodayGrowth, totalClientYesterdayGrowth, {
        upLabel: "Up for yesterday",
        downLabel: "Down for yesterday",
      }),
    ),
    buildDashboardCard(
      "total_technician",
      "Total Technician",
      totalTechnician,
      buildDashboardComparison(totalTechnicianTodayGrowth, totalTechnicianYesterdayGrowth, {
        upLabel: "Up for yesterday",
        downLabel: "Down for yesterday",
      }),
    ),
    buildDashboardCard(
      "total_supplier",
      "Total Supplier",
      totalSupplier,
      buildDashboardComparison(totalSupplierTodayGrowth, totalSupplierYesterdayGrowth, {
        upLabel: "Up for yesterday",
        downLabel: "Down for yesterday",
      }),
    ),
  ];
  const countDetails = overviewCards.reduce((accumulator, card) => {
    accumulator[card.key] = card;
    return accumulator;
  }, {});

  return {
    total_user: totalUser,
    total_client: totalClient,
    total_technician: totalTechnician,
    total_supplier: totalSupplier,
    overview_cards: overviewCards,
    count_details: countDetails,
  };
}

async function buildOwnerDetailPayload(owner) {
  const ownerTasks = await prisma.task.findMany({
    where: {
      userId: owner.id,
    },
    include: {
      boat: {
        select: {
          id: true,
          name: true,
          rego: true,
        },
      },
    },
    orderBy: [
      { date_scheduled_from: "desc" },
      { id: "desc" },
    ],
  });

  const supplierIds = owner.UserSupplier.map((link) => link.supplierId);
  const supplierTasks = supplierIds.length
    ? await prisma.task.findMany({
      where: {
        userId: owner.id,
        supplierId: {
          in: supplierIds,
        },
      },
      include: {
        boat: {
          select: {
            id: true,
            rego: true,
          },
        },
      },
      orderBy: [
        { date_scheduled_from: "desc" },
        { id: "desc" },
      ],
    })
    : [];

  const supplierTasksById = supplierTasks.reduce((acc, task) => {
    const key = task.supplierId;
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  const technicianTasksById = ownerTasks.reduce((acc, task) => {
    const key = task.assignStaffId;
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  const suppliers = owner.UserSupplier.map((link) => {
    const supplier = link.supplier;
    const tasks = supplierTasksById[supplier.id] || [];
    const inProgressJobs = tasks.filter((task) => getTaskJobStatus(task) === "in progress").length;
    const completedJobs = tasks.filter((task) => getTaskJobStatus(task) === "completed").length;

    return {
      id: supplier.id,
      supplier_company_name: supplier.company_name,
      supplier_address: supplier.city,
      supplier_phone_number: supplier.phone_no,
      owner_name: getOwnerDisplayName(owner),
      owner_company_name: owner.company_name,
      owner_email: owner.email,
      phone_number: owner.phone_no,
      supplier_name: getSupplierDisplayName(supplier),
      user_type: "SUPPLIER",
      supplier_email: supplier.email,
      company_name: supplier.company_name,
      abn: supplier.abn,
      accounting_software: supplier.accounting_software_used,
      company_details: supplier.company_description || supplier.about_us,
      services_offered: supplier.services_offered,
      status: getUserStatusLabel(supplier.status === 1),
      supplier_jobs: {
        total_jobs: tasks.length,
        in_progress_jobs: inProgressJobs,
        completed_jobs: completedJobs,
        job_history: tasks.map(formatSupplierJobHistory),
      },
    };
  });

  const now = new Date();
  const docks = owner.Dock.map((dock) => {
    const currentBookings = dock.dockBooking.filter((booking) => booking.book_from <= now && booking.book_to >= now);
    return {
      id: dock.id,
      dock_name: dock.name,
      location: dock.address,
      rate_per_day: dock.booking_cost_per_day,
      occupancy: currentBookings.length,
      status: currentBookings.length ? "occupied" : "available",
    };
  });

  const boats = owner.Boat.map((boat) => {
    const { booking, isActive } = getLatestOrActiveBooking(boat.DockBooking || []);

    return {
      id: boat.id,
      name: boat.name,
      owner_name: boat.owners_name,
      start_date: booking?.book_from || boat.book_from || null,
      end_date: booking?.book_to || boat.book_to || null,
      status: isActive ? "assigned" : "unassigned",
    };
  });

  const technicians = owner.Staff_Member.map((staff) => ({
    id: staff.id,
    technician_name: staff.full_name,
    user_type: "TECHNICIAN",
    designation: staff.role,
    email: staff.email,
    phone_number: staff.phone_no,
    status: getUserStatusLabel(staff.status === 1),
    total_jobs: (technicianTasksById[staff.id] || []).length,
  }));

  const assetCounts = {
    total_docks: owner.Dock.length,
    total_boats: owner.Boat.length,
    total_staff: owner.Staff_Member.length,
    total_supplier: owner.UserSupplier.length,
  };

  const documents = buildDocumentList({
    tradeLicense: owner.trade_license,
    insuranceFiles: owner.InsuranceFile,
  });

  return {
    id: owner.id,
    username: getOwnerDisplayName(owner),
    user_type: "OWNER",
    email: owner.email,
    base_port_name: owner.service_region,
    date_joined: owner.createdAt,
    status: getUserStatusLabel(owner.isVerified),
    profile_card: {
      display_name: owner.company_name,
      sub_title: getOwnerDisplayName(owner),
      base_port: owner.service_region,
      badge: "Business Owner",
      email: owner.email,
      phone_number: owner.phone_no,
      address: owner.service_region,
      logo_url: getPublicProfileFileUrl(owner.company_logo),
    },
    documents,
    owner_information: {
      username: getOwnerDisplayName(owner),
      user_type: "Business Owner",
      company_email: owner.email,
      company_name: owner.company_name,
      abn: owner.abn,
      accounting_software: owner.accounting_software_used,
      owner_address: owner.service_region,
      base_port_name: owner.service_region,
      company_details: owner.about_us,
      services_offered: owner.services_offered,
      services_offered_list: splitServicesOffered(owner.services_offered),
      joined_date: owner.createdAt,
    },
    technicians,
    suppliers,
    asset_overview: {
      counts: assetCounts,
      docks,
      boats,
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        supplier_name: supplier.supplier_name,
        email: supplier.supplier_email,
        total_jobs: supplier.supplier_jobs.total_jobs,
      })),
    },
    tabs: {
      owner_information: {
        account_information: {
          username: getOwnerDisplayName(owner),
          user_type: "Business Owner",
          company_email: owner.email,
          company_name: owner.company_name,
          abn: owner.abn,
          accounting_software: owner.accounting_software_used,
          owner_address: owner.service_region,
          base_port_name: owner.service_region,
          joined_date: owner.createdAt,
        },
        company_details: owner.about_us,
        services_offered: splitServicesOffered(owner.services_offered),
      },
      assets_overview: {
        summary_cards: assetCounts,
        docks,
        boats,
      },
      supplier: {
        summary_cards: assetCounts,
        suppliers: suppliers.map((supplier) => ({
          id: supplier.id,
          supplier_name: supplier.supplier_name,
          email: supplier.supplier_email,
          total_jobs: supplier.supplier_jobs.total_jobs,
        })),
      },
      technician: {
        summary_cards: assetCounts,
        technicians: technicians.map((technician) => ({
          id: technician.id,
          technician_name: technician.technician_name,
          email: technician.email,
          user_type: "TECHNICIAN",
          total_jobs: technician.total_jobs,
        })),
      },
    },
  };
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

  return {
    id: supplier.id,
    username: getSupplierDisplayName(supplier),
    user_type: "SUPPLIER",
    profile_image: getPublicProfileFileUrl(supplier.company_logo),
    email: supplier.email,
    base_port_name: basePortName,
    date_joined: supplier.createdAt,
    status: getUserStatusLabel(supplier.status === 1),
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

function buildTechnicianDetailPayload(technician) {
  const owner = technician.user || technician.Task[0]?.user || null;
  const jobSummary = buildJobSummary(technician.Task);
  const jobHistory = buildJobHistory(technician.Task);

  return {
    id: technician.id,
    username: technician.full_name,
    user_type: "TECHNICIAN",
    email: technician.email,
    date_joined: technician.createdAt,
    status: getUserStatusLabel(technician.status === 1),
    profile_card: {
      display_name: technician.full_name,
      sub_title: technician.role,
      badge: "Technician",
      email: technician.email,
      phone_number: technician.phone_no,
      logo_url: null,
    },
    owner_details: buildOwnerContactCard(owner),
    technician_information: {
      technician_name: technician.full_name,
      designation: technician.role,
      email: technician.email,
      phone_number: technician.phone_no,
      home_address: technician.home_address,
      hourly_rate: technician.hourly_rate,
    },
    technician_jobs: {
      ...jobSummary,
      job_history: jobHistory,
    },
    tabs: {
      technician_information: {
        account_information: {
          technician_name: technician.full_name,
          designation: technician.role,
          email: technician.email,
          phone_number: technician.phone_no,
        },
      },
      technician_jobs: {
        summary_cards: jobSummary,
        job_history: jobHistory,
      },
    },
  };
}

function formatRelativeTime(date) {
  const target = new Date(date);
  const now = new Date();
  const diffMs = now - target;
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return target.toISOString();
}

function buildAdminNotificationTitle(notification) {
  if (notification.type === "task") {
    return "Task Update";
  }

  if (notification.type) {
    return notification.type
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return "Notification";
}

function buildAdminNotificationDeepLink(notification) {
  if (notification.type === "task" && notification.taskId) {
    return {
      path: "/job-details",
      params: {
        id: notification.taskId,
      },
    };
  }

  return null;
}

function buildAdminNotificationItem(notification) {
  return {
    id: notification.id,
    title: buildAdminNotificationTitle(notification),
    description: notification.content || "No description available",
    time_ago: formatRelativeTime(notification.createdAt),
    is_read: notification.isRead,
    type: notification.type,
    created_at: notification.createdAt,
    task_id: notification.taskId,
    to_user_id: notification.toUserId,
    by_staff: notification.byStaff
      ? {
        id: notification.byStaff.id,
        full_name: notification.byStaff.full_name,
        email: notification.byStaff.email,
      }
      : null,
    task: notification.task
      ? {
        id: notification.task.id,
        description: notification.task.description,
        job_number: notification.task.jobNumber,
      }
      : null,
    deep_link: buildAdminNotificationDeepLink(notification),
    data: notification.data,
  };
}

function buildSignupNotificationItem(user) {
  const displayName = getOwnerDisplayName(user);
  return {
    id: `signup-${user.id}`,
    title: "New Account Sign Up",
    description: `${displayName} created a new account`,
    time_ago: formatRelativeTime(user.createdAt),
    is_read: false,
    type: "signup",
    created_at: user.createdAt,
    task_id: null,
    to_user_id: user.id,
    by_staff: null,
    task: null,
    deep_link: {
      path: "/user-details",
      params: {
        id: user.id,
        user_type: "OWNER",
      },
    },
    data: {
      user_id: user.id,
      user_type: "OWNER",
      email: user.email,
      company_name: user.company_name || null,
    },
  };
}

function buildSubscriptionPurchaseNotificationItem(subscription) {
  const displayName = getOwnerDisplayName(subscription.user);
  const eventDate = subscription.renewed_at || subscription.start_date || subscription.created_at;
  const billingCycle = normalizeBillingCycle(subscription.plan?.billingCycle);
  const amount = subscription.plan?.price ?? null;

  return {
    id: `subscription-${subscription.id}`,
    title: "Subscription Purchase",
    description: `${displayName} purchased ${subscription.plan?.name || "a subscription"}`,
    time_ago: formatRelativeTime(eventDate),
    is_read: false,
    type: "subscription_purchase",
    created_at: eventDate,
    task_id: null,
    to_user_id: subscription.userId,
    by_staff: null,
    task: null,
    deep_link: {
      path: "/subscriptions",
      params: {
        id: subscription.id,
      },
    },
    data: {
      subscription_id: subscription.id,
      user_id: subscription.userId,
      email: subscription.user?.email || null,
      plan: subscription.plan?.name || null,
      billing_cycle: billingCycle,
      amount_paid: amount,
      status: getSubscriptionStatusLabel(subscription),
      stripe_subscription_id: subscription.stripeSubscriptionId || null,
    },
  };
}

function normalizeBillingCycle(billingCycle) {
  const value = billingCycle?.toString().trim().toLowerCase();
  if (value === "yearly" || value === "annually" || value === "annual") return "Yearly";
  return "Monthly";
}

function getSubscriptionStatusLabel(subscription) {
  const now = new Date();

  if (subscription.sub_status === 1) return "active";
  if (subscription.sub_status === 3) return "canceled";
  if (subscription.sub_status === -1) {
    if (subscription.trial_end_date && new Date(subscription.trial_end_date) < now) {
      return "expired";
    }
    return "active";
  }
  if (subscription.failed_at) return "expired";
  return "expired";
}

function getSubscriptionStatusAtDate(subscription, referenceDate) {
  const pointInTime = new Date(referenceDate);
  const startDate = subscription.start_date ? new Date(subscription.start_date) : null;
  const canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at) : null;
  const failedAt = subscription.failed_at ? new Date(subscription.failed_at) : null;
  const trialEndDate = subscription.trial_end_date ? new Date(subscription.trial_end_date) : null;

  if (startDate && startDate > pointInTime) {
    return null;
  }

  if (subscription.sub_status === 3) {
    if (canceledAt && canceledAt > pointInTime) {
      return "active";
    }
    return "canceled";
  }

  if (subscription.sub_status === -1) {
    if (trialEndDate && trialEndDate < pointInTime) {
      return "expired";
    }
    return "active";
  }

  if (failedAt && failedAt <= pointInTime) {
    return "expired";
  }

  return subscription.sub_status === 1 ? "active" : "expired";
}

function buildSubscriptionListItem(subscription, index = 0) {
  return {
    id: subscription.id,
    client_name: getOwnerDisplayName(subscription.user),
    email: subscription.user.email,
    plan: subscription.plan?.name || null,
    billing_cycle: normalizeBillingCycle(subscription.plan?.billingCycle),
    amount: subscription.plan?.price ?? null,
    date_subscribed: subscription.start_date || subscription.created_at,
    status: getSubscriptionStatusLabel(subscription),
    user_id: subscription.userId,
    plan_id: subscription.planId,
    stripe_subscription_id: subscription.stripeSubscriptionId,
  };
}

function formatStripePaymentMethod(paymentMethod) {
  if (!paymentMethod) return null;

  if (paymentMethod.type === "card" && paymentMethod.card) {
    const { brand, last4, exp_month, exp_year } = paymentMethod.card;
    return `${brand?.toUpperCase() || "CARD"} ending in ${last4} (${exp_month}/${exp_year})`;
  }

  if (paymentMethod.type === "au_becs_debit" && paymentMethod.au_becs_debit) {
    const { bsb_number, last4 } = paymentMethod.au_becs_debit;
    return `AU BECS debit ending in ${last4}${bsb_number ? ` (BSB ${bsb_number})` : ""}`;
  }

  if (paymentMethod.type === "us_bank_account" && paymentMethod.us_bank_account) {
    const { bank_name, last4 } = paymentMethod.us_bank_account;
    return `${bank_name || "Bank account"} ending in ${last4}`;
  }

  return paymentMethod.type.replace(/_/g, " ");
}

function formatStripeSource(source) {
  if (!source) return null;

  if (source.object === "card") {
    const brand = source.brand || source.name || "CARD";
    const last4 = source.last4 || "XXXX";
    const expMonth = source.exp_month || "";
    const expYear = source.exp_year || "";
    const expiry = expMonth && expYear ? ` (${expMonth}/${expYear})` : "";
    return `${String(brand).toUpperCase()} ending in ${last4}${expiry}`;
  }

  if (source.object === "bank_account") {
    const bankName = source.bank_name || "Bank account";
    const last4 = source.last4 || "XXXX";
    return `${bankName} ending in ${last4}`;
  }

  return source.object || null;
}

async function resolveSubscriptionPaymentMethod(subscription) {
  try {
    let paymentMethodId = null;
    let sourceId = null;

    if (subscription.stripeSubscriptionId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {
        expand: ["default_payment_method", "latest_invoice.payment_intent.payment_method"],
      });
      paymentMethodId =
        stripeSubscription.default_payment_method ||
        null;
      sourceId = stripeSubscription.default_source || null;

      if (!paymentMethodId) {
        paymentMethodId = stripeSubscription.latest_invoice?.payment_intent?.payment_method || null;
      }
    }

    if (paymentMethodId && typeof paymentMethodId !== "string") {
      return formatStripePaymentMethod(paymentMethodId);
    }

    if (paymentMethodId && typeof paymentMethodId === "string") {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      return formatStripePaymentMethod(paymentMethod);
    }

    if (sourceId && subscription.stripeCustomerId) {
      const source = await stripe.customers.retrieveSource(subscription.stripeCustomerId, sourceId);
      return formatStripeSource(source);
    }

    if (subscription.stripeCustomerId) {
      const stripeCustomer = await stripe.customers.retrieve(subscription.stripeCustomerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (stripeCustomer && !stripeCustomer.deleted) {
        paymentMethodId =
          stripeCustomer.invoice_settings?.default_payment_method ||
          null;
        sourceId = stripeCustomer.default_source || null;

        if (paymentMethodId && typeof paymentMethodId !== "string") {
          return formatStripePaymentMethod(paymentMethodId);
        }

        if (paymentMethodId && typeof paymentMethodId === "string") {
          const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
          return formatStripePaymentMethod(paymentMethod);
        }

        if (sourceId) {
          const source = await stripe.customers.retrieveSource(subscription.stripeCustomerId, sourceId);
          return formatStripeSource(source);
        }

        const paymentMethods = await stripe.paymentMethods.list({
          customer: subscription.stripeCustomerId,
          type: "card",
          limit: 1,
        });

        if (paymentMethods.data.length > 0) {
          return formatStripePaymentMethod(paymentMethods.data[0]);
        }
      }
    }

    return null;
  } catch (error) {
    console.log("Failed to resolve subscription payment method:", error?.message || error);
    return null;
  }
}

function buildSubscriptionDetailPayload(subscription, history = [], paymentMethod = null) {
  return {
    id: subscription.id,
    client_name: getOwnerDisplayName(subscription.user),
    email: subscription.user.email,
    status: getSubscriptionStatusLabel(subscription),
    plan: subscription.plan?.name || null,
    billing_cycle: normalizeBillingCycle(subscription.plan?.billingCycle),
    amount_paid: subscription.plan?.price ?? null,
    date_paid: subscription.renewed_at || subscription.start_date || subscription.created_at,
    transaction_id: subscription.stripeSubscriptionId || subscription.stripeCustomerId || null,
    payment_method: paymentMethod,
    stripe_subscription_id: subscription.stripeSubscriptionId,
    stripe_customer_id: subscription.stripeCustomerId,
    created_at: subscription.created_at,
    start_date: subscription.start_date,
    renewed_at: subscription.renewed_at,
    canceled_at: subscription.canceled_at,
    trial_end_date: subscription.trial_end_date,
    failed_at: subscription.failed_at,
    history: history.map((item, index) => ({
      id: item.id,
      plan: item.plan?.name || null,
      billing_cycle: normalizeBillingCycle(item.plan?.billingCycle),
      amount: item.plan?.price ?? null,
      status: getSubscriptionStatusLabel(item),
      date: item.renewed_at || item.start_date || item.created_at,
      transaction_id: item.stripeSubscriptionId || item.stripeCustomerId || null,
    })),
  };
}

function getPlanGroupKey(plan) {
  return `${plan.name || ""}__${plan.maxStaffUsers}`;
}

function buildPlanDescription(planName, billingCycle) {
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const duration = normalizedCycle === "Yearly" ? "12 Month" : "1 Month";
  return `${planName} ${duration} subscription to First Mate ServiceHub`;
}

function inferMaxStaffUsers(planName, explicitValue) {
  if (explicitValue !== undefined && explicitValue !== null && explicitValue !== "") {
    return parseInt(explicitValue);
  }

  const matches = String(planName || "").match(/\d+/g);
  if (!matches?.length) {
    return 1;
  }

  const numericValues = matches.map((item) => parseInt(item)).filter((item) => !Number.isNaN(item));
  return Math.max(...numericValues, 1);
}

function groupPlansForAdmin(plans) {
  const groups = new Map();

  plans.forEach((plan) => {
    const key = getPlanGroupKey(plan);
    const billingCycle = normalizeBillingCycle(plan.billingCycle);

    if (!groups.has(key)) {
      groups.set(key, {
        id: plan.id,
        plan_name: plan.name,
        max_staff_users: plan.maxStaffUsers,
        status: "active",
        monthly_plan_id: null,
        yearly_plan_id: null,
        monthly_price: null,
        annually_price: null,
        monthly_stripe_price_id: null,
        yearly_stripe_price_id: null,
        plan_description: `${plan.name} subscription to First Mate ServiceHub`,
        monthly_description: buildPlanDescription(plan.name, "Monthly"),
        annually_description: buildPlanDescription(plan.name, "Yearly"),
      });
    }

    const group = groups.get(key);
    if (plan.id < group.id) {
      group.id = plan.id;
    }

    if (billingCycle === "Yearly") {
      group.yearly_plan_id = plan.id;
      group.annually_price = plan.price;
      group.yearly_stripe_price_id = plan.stripePriceId;
    } else {
      group.monthly_plan_id = plan.id;
      group.monthly_price = plan.price;
      group.monthly_stripe_price_id = plan.stripePriceId;
    }

    if (!plan.stripePriceId && !group.monthly_stripe_price_id && !group.yearly_stripe_price_id) {
      group.status = "disabled";
    } else if (group.monthly_stripe_price_id || group.yearly_stripe_price_id) {
      group.status = "active";
    }
  });

  return Array.from(groups.values()).sort((a, b) => (a.plan_name || "").localeCompare(b.plan_name || ""));
}

async function getPlanGroupById(planId) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    return null;
  }

  const relatedPlans = await prisma.plan.findMany({
    where: {
      name: plan.name,
      maxStaffUsers: plan.maxStaffUsers,
    },
    orderBy: {
      id: "asc",
    },
  });

  return groupPlansForAdmin(relatedPlans)[0] || null;
}

function getManagedUserSelect(type) {
  if (type === "ADMIN") {
    return {
      id: true,
      email: true,
      full_name: true,
      phone_no: true,
      profile_image: true,
      role: true,
      status: true,
      last_login_at: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  if (type === "TECHNICIAN") {
    return {
      id: true,
      email: true,
      role: true,
      full_name: true,
      home_address: true,
      userId: true,
      status: true,
      hourly_rate: true,
      system_deactivation_status: true,
      phone_no: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          company_name: true,
        },
      },
    };
  }

  return {
    id: true,
    email: true,
    first_name: true,
    last_name: true,
    company_name: true,
    company_description: true,
    status: true,
    phone_no: true,
    city: true,
    company_logo: true,
    abn: true,
    trade_license: true,
    accounting_software_used: true,
    about_us: true,
    service_region: true,
    services_offered: true,
    complete_profile_status: true,
    createdAt: true,
    updatedAt: true,
  };
}

function getOwnerUserSelect() {
  return {
    id: true,
    email: true,
    first_name: true,
    last_name: true,
    company_name: true,
    phone_no: true,
    isVerified: true,
    company_logo: true,
    trade_license: true,
    accounting_software_used: true,
    about_us: true,
    service_region: true,
    services_offered: true,
    stripeCustomerId: true,
    xero_connected: true,
    createdAt: true,
    updatedAt: true,
    Boat: true,
    Dock: true,
    Staff_Member: {
      select: getManagedUserSelect("TECHNICIAN"),
    },
    UserSupplier: {
      include: {
        supplier: {
          select: getManagedUserSelect("SUPPLIER"),
        },
      },
    },
    Subscription: {
      include: {
        plan: true,
      },
    },
  };
}

function withOwnerFileUrls(owner) {
  if (!owner) return owner;
  return {
    ...owner,
    company_logo: owner.company_logo ? `${baseurl}/profile/${owner.company_logo}` : null,
    trade_license: owner.trade_license ? `${baseurl}/profile/${owner.trade_license}` : null,
    Boat: owner.Boat.map((boat) => ({
      ...boat,
      avatar_url: boat.avatar_url ? `${baseurl}/boat/${boat.avatar_url}` : null,
    })),
  };
}

function withSupplierFileUrls(supplier) {
  if (!supplier) return supplier;
  return {
    ...supplier,
    base_port_name: getSupplierBasePortName(supplier),
    company_logo: supplier.company_logo ? `${baseurl}/profile/${supplier.company_logo}` : null,
    trade_license: supplier.trade_license ? `${baseurl}/profile/${supplier.trade_license}` : null,
  };
}

function parseCost(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cost = Number(value);
  return Number.isNaN(cost) ? 0 : cost;
}

function withDockCalculatedCosts(dock) {
  if (!dock) return dock;
  const maintenanceCost = parseCost(dock.booking_cost);
  const dailyRent = parseCost(dock.booking_cost_per_day);

  return {
    ...dock,
    monthly_rent: dailyRent * 30,
    maintenance_cost: maintenanceCost,
  };
}

function withDockBookingCalculatedCosts(booking) {
  if (!booking) return booking;
  return {
    ...booking,
    dock: withDockCalculatedCosts(booking.dock),
  };
}

function withManagedUserType(type, user) {
  if (!user) return user;
  if (type === "ADMIN") return { type, ...withAdminProfileImageUrl(user) };
  if (type === "SUPPLIER") return { type, ...withSupplierFileUrls(user) };
  return { type, ...user };
}

function getInviteLink(type, token) {
  if (type === "ADMIN") return `${baseurl}/admin/verifyPassword/${token}`;
  if (type === "TECHNICIAN") return `${baseurl}/staff/verifyPassword/${token}`;
  return `${baseurl}/supplier/verifyPassword/${token}`;
}

async function sendInviteEmail({ email, type, token }) {
  const mailOptions = {
    from: "noreply@first-mate.net",
    to: email,
    subject: "ServiceHub Invitation",
    template: "forget_template",
    context: {
      image_logo: `${baseurl}/marine_new_logo.png`,
      href_url: getInviteLink(type, token),
      msg: `You have been invited as ${type.toLowerCase()}. Please click below link to activate your account and set password.`,
    },
  };

  return transporter.sendMail(mailOptions);
}

async function assertManagedUserEmailAvailable(type, email, ignoreId) {
  const queries = [
    prisma.admin.findUnique({ where: { email } }),
    prisma.staff_Member.findUnique({ where: { email } }),
    prisma.supplier.findUnique({ where: { email } }),
  ];
  const [admin, technician, supplier] = await Promise.all(queries);

  const existingUsers = [
    admin && { type: "ADMIN", id: admin.id },
    technician && { type: "TECHNICIAN", id: technician.id },
    supplier && { type: "SUPPLIER", id: supplier.id },
  ].filter(Boolean);

  const existingOtherUser = existingUsers.find((user) => !(user.type === type && user.id === ignoreId));
  return !existingOtherUser;
}

export async function signup(req, res) {
  try {
    const { email, password, full_name, phone_no, role, profile_image } = req.body;

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      password: Joi.string().min(8).required(),
      full_name: Joi.string().max(255).required(),
      phone_no: Joi.string().max(255).optional().allow('', null),
      profile_image: Joi.string().max(255).optional().allow('', null),
      role: Joi.string().max(255).optional(),
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

    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
        status: 400,
      });
    }

    const hashedPassword = await argon2.hash(password);
    const profileImage = getProfileImageFromRequest(req, profile_image);
    const admin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
        full_name,
        phone_no,
        ...(profileImage !== undefined && { profile_image: profileImage }),
        role: role || "ADMIN",
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Admin created successfully!",
      data: removeSensitiveAdminFields(admin),
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

export async function login(req, res) {
  try {
    const secretKey = process.env.SECRET_KEY;
    const { email, password } = req.body;

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      password: Joi.string().min(8).required(),
    });

    const result = schema.validate({ email, password });
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

    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin || !(await argon2.verify(admin.password, password))) {
      return res.status(400).json({
        success: false,
        message: "Invalid login credentials",
        status: 400,
      });
    }

    if (admin.status !== 1) {
      return res.status(400).json({
        success: false,
        message: "Your admin account is inactive",
        status: 400,
      });
    }

    const token = jwt.sign({ adminId: admin.id }, secretKey, { expiresIn: '24w' });
    const adminData = await prisma.admin.update({
      where: { id: admin.id },
      data: {
        token,
        last_login_at: new Date(),
      },
    });

    return res.json({
      status: 200,
      success: true,
      message: "Login successful!",
      data: {
        token,
        adminData: removeSensitiveAdminFields(adminData),
      },
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

export async function myProfile(req, res) {
  try {
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Admin profile data!",
      data: removeSensitiveAdminFields(req.admin),
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

export async function updateProfile(req, res) {
  try {
    const { full_name, phone_no, profile_image } = req.body;

    const schema = Joi.object({
      full_name: Joi.string().max(255).optional(),
      phone_no: Joi.string().max(255).optional().allow('', null),
      profile_image: Joi.string().max(255).optional().allow('', null),
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

    const profileImage = getProfileImageFromRequest(req, profile_image);
    const admin = await prisma.admin.update({
      where: { id: req.admin.id },
      data: {
        ...(full_name !== undefined && { full_name }),
        ...(phone_no !== undefined && { phone_no }),
        ...(profileImage !== undefined && { profile_image: profileImage }),
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Admin profile updated successfully!",
      data: removeSensitiveAdminFields(admin),
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

export async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;

    const schema = Joi.object({
      oldPassword: Joi.string().min(8).required(),
      newPassword: Joi.string().min(8).required(),
    });

    const result = schema.validate({ oldPassword, newPassword });
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

    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.id },
    });

    if (!admin || !(await argon2.verify(admin.password, oldPassword))) {
      return res.status(400).json({
        success: false,
        message: "Old password is incorrect",
        status: 400,
      });
    }

    const hashedPassword = await argon2.hash(newPassword);
    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        password: hashedPassword,
        token: null,
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Password changed successfully!",
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

export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    const schema = Joi.object({
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
    });

    const result = schema.validate({ email });
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

    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "Email address not found. Please enter a valid email",
        status: 400,
      });
    }

    const genToken = randomStringAsBase64Url(20);
    const updatedAdmin = await prisma.admin.update({
      where: { email },
      data: {
        token: genToken,
      },
      select: {
        token: true,
      },
    });

    const mailOptions = {
      from: "noreply@first-mate.net",
      to: email,
      subject: "Forgot Password",
      template: "forget_template",
      context: {
        image_logo: `${baseurl}/marine_new_logo.png`,
        href_url: `${baseurl}/admin/verifyPassword/${updatedAdmin.token}`,
        msg: "Please click below link to change password.",
      },
    };

    transporter.sendMail(mailOptions, async function (error, info) {
      if (error) {
        console.log(error);
        return res.status(400).json({
          success: false,
          message: "Mail Not Delivered",
          status: 400,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Password reset link sent successfully. Please check your email ",
        status: 200,
      });
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

export async function verifyPassword(req, res) {
  try {
    const token = req.params.token;

    if (!token) {
      return res.status(400).send("Invalid link");
    }

    const admin = await prisma.admin.findFirst({
      where: {
        token,
      },
    });

    if (!admin) {
      return res.render(path.join(__dirname, '../view/', 'forgetPasswordAdmin.ejs'), {
        msg: "This admin is not registered",
        token: "",
      });
    }

    return res.render(path.join(__dirname, '../view/', 'forgetPasswordAdmin.ejs'), {
      msg: "",
      token,
    });
  } catch (error) {
    console.log(error);
    return res.send(`<div class="container">
        <p>404 Error, Page Not Found</p>
        </div> `);
  }
}

export async function resetPassword(req, res) {
  try {
    const { password, confirm_password, token } = req.body;

    const schema = Joi.object({
      password: Joi.string().min(8).required(),
      confirm_password: Joi.string().min(8).required(),
      token: Joi.string().required(),
    });

    const result = schema.validate({ password, confirm_password, token });
    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.render(path.join(__dirname, '../view/', 'forgetPasswordAdmin.ejs'), {
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        msg: message,
        token,
      });
    }

    if (password !== confirm_password) {
      return res.render(path.join(__dirname, '../view/', 'forgetPasswordAdmin.ejs'), {
        msg: "Password and Confirm Password do not match",
        token,
      });
    }

    const admin = await prisma.admin.findFirst({
      where: {
        token,
      },
    });

    if (!admin) {
      return res.render(path.join(__dirname, '../view/', 'forgetPasswordAdmin.ejs'), {
        msg: "Invalid or expired reset link",
        token: "",
      });
    }

    const hashedPassword = await argon2.hash(password);
    await prisma.admin.update({
      where: {
        id: admin.id,
      },
      data: {
        password: hashedPassword,
        token: null,
      },
    });

    return res.sendFile(path.join(__dirname, '../view/message.html'), { msg: "" });
  } catch (error) {
    console.log(error);
    return res.render(path.join(__dirname, '../view/', 'forgetPasswordAdmin.ejs'), {
      msg: "Internal server error",
      token: req.body?.token || "",
    });
  }
}

export async function createManagedUser(req, res) {
  try {
    const type = normalizeManagedUserType(req.body.type);

    const schema = Joi.object({
      type: Joi.string().valid("ADMIN", "TECHNICIAN", "SUPPLIER").required(),
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      password: Joi.string().min(8).required(),
      full_name: Joi.string().max(255).optional(),
      first_name: Joi.string().max(255).optional().allow('', null),
      last_name: Joi.string().max(255).optional().allow('', null),
      company_name: Joi.string().optional().allow('', null),
      company_description: Joi.string().optional().allow('', null),
      city: Joi.string().max(255).optional().allow('', null),
      phone_no: Joi.string().max(255).optional().allow('', null),
      company_logo: Joi.string().max(255).optional().allow('', null),
      abn: Joi.string().max(255).optional().allow('', null),
      trade_license: Joi.string().max(255).optional().allow('', null),
      accounting_software_used: Joi.string().optional().allow('', null),
      about_us: Joi.string().optional().allow('', null),
      service_region: Joi.string().optional().allow('', null),
      services_offered: Joi.string().optional().allow('', null),
      complete_profile_status: Joi.number().integer().optional(),
      profile_image: Joi.string().max(255).optional().allow('', null),
      role: Joi.string().max(255).optional(),
      status: Joi.number().integer().optional(),
      userId: Joi.number().integer().optional(),
      home_address: Joi.string().optional().allow('', null),
      hourly_rate: Joi.number().optional(),
      system_deactivation_status: Joi.number().integer().optional(),
    });

    const result = schema.validate({ ...req.body, type });
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

    const {
      email,
      password,
      full_name,
      first_name,
      last_name,
      company_name,
      company_description,
      city,
      phone_no,
      company_logo,
      abn,
      trade_license,
      accounting_software_used,
      about_us,
      service_region,
      services_offered,
      complete_profile_status,
      profile_image,
      role,
      status,
      userId,
      home_address,
      hourly_rate,
      system_deactivation_status,
    } = result.value;

    if ((type === "TECHNICIAN" || type === "SUPPLIER") && !userId) {
      return res.status(400).json({
        success: false,
        message: `userId is required for ${type.toLowerCase()}`,
        status: 400,
      });
    }

    const emailAvailable = await assertManagedUserEmailAvailable(type, email);
    if (!emailAvailable) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
        status: 400,
      });
    }

    const hashedPassword = await argon2.hash(password);
    const profileImage = getProfileImageFromRequest(req, profile_image);
    let createdUser;

    if (type === "ADMIN") {
      createdUser = await prisma.admin.create({
        data: {
          email,
          password: hashedPassword,
          full_name: full_name || `${first_name || ""} ${last_name || ""}`.trim() || "Admin",
          phone_no,
          ...(profileImage !== undefined && { profile_image: profileImage }),
          role: role || "ADMIN",
          ...(status !== undefined && { status }),
        },
        select: getManagedUserSelect(type),
      });
    }

    if (type === "TECHNICIAN") {
      const ownerUser = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
      });

      if (!ownerUser) {
        return res.status(400).json({
          success: false,
          message: "Owner user not found for technician",
          status: 400,
        });
      }

      createdUser = await prisma.staff_Member.create({
        data: {
          email,
          password: hashedPassword,
          showPassword: password,
          full_name: full_name || `${first_name || ""} ${last_name || ""}`.trim() || "Technician",
          role: role || "Technician",
          phone_no: phone_no || "",
          userId: parseInt(userId),
          hourly_rate: hourly_rate !== undefined ? parseFloat(hourly_rate) : 0,
          home_address: home_address || "",
          ...(status !== undefined && { status }),
          ...(system_deactivation_status !== undefined && { system_deactivation_status }),
        },
        select: getManagedUserSelect(type),
      });
    }

    if (type === "SUPPLIER") {
      const ownerUser = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
      });

      if (!ownerUser) {
        return res.status(400).json({
          success: false,
          message: "Owner user not found for supplier",
          status: 400,
        });
      }

      createdUser = await prisma.supplier.create({
        data: {
          email,
          password: hashedPassword,
          first_name,
          last_name,
          company_name,
          company_description,
          city,
          phone_no,
          company_logo,
          abn,
          trade_license,
          accounting_software_used,
          about_us,
          service_region,
          services_offered,
          ...(complete_profile_status !== undefined && { complete_profile_status }),
          ...(status !== undefined && { status }),
        },
        select: getManagedUserSelect(type),
      });

      await ensureSupplierOwnerLink({
        supplierId: createdUser.id,
        userId,
        fallbackName: company_name || `${first_name || ""} ${last_name || ""}`.trim() || email,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: `${type} created successfully!`,
      data: withManagedUserType(type, createdUser),
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

export async function getManagedUsers(req, res) {
  try {
    const type = normalizeManagedUserType(req.query.type);
    const allowedTypes = ["ADMIN", "TECHNICIAN", "SUPPLIER"];

    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Allowed values: ADMIN, TECHNICIAN, SUPPLIER",
        status: 400,
      });
    }

    const fetchers = {
      ADMIN: () => prisma.admin.findMany({
        select: getManagedUserSelect("ADMIN"),
        orderBy: { createdAt: 'desc' },
      }),
      TECHNICIAN: () => prisma.staff_Member.findMany({
        select: getManagedUserSelect("TECHNICIAN"),
        orderBy: { createdAt: 'desc' },
      }),
      SUPPLIER: () => prisma.supplier.findMany({
        select: getManagedUserSelect("SUPPLIER"),
        orderBy: { createdAt: 'desc' },
      }),
    };

    const [totalAdmin, totalTechnician, totalSupplier] = await Promise.all([
      prisma.admin.count(),
      prisma.staff_Member.count(),
      prisma.supplier.count(),
    ]);

    const counts = {
      totalAdmin,
      totalTechnician,
      totalSupplier,
      totalUser: totalAdmin + totalTechnician + totalSupplier,
    };

    if (type) {
      const users = await fetchers[type]();
      return res.status(200).json({
        status: 200,
        success: true,
        message: "Users data!",
        counts,
        data: users.map((user) => withManagedUserType(type, user)),
      });
    }

    const [admins, technicians, suppliers] = await Promise.all([
      fetchers.ADMIN(),
      fetchers.TECHNICIAN(),
      fetchers.SUPPLIER(),
    ]);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Users data!",
      counts,
      data: [
        ...admins.map((user) => withManagedUserType("ADMIN", user)),
        ...technicians.map((user) => withManagedUserType("TECHNICIAN", user)),
        ...suppliers.map((user) => withManagedUserType("SUPPLIER", user)),
      ],
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

export async function getManagedUserById(req, res) {
  try {
    const type = normalizeManagedUserType(req.query.type);
    const id = parseInt(req.params.id);

    if (!["ADMIN", "TECHNICIAN", "SUPPLIER"].includes(type) || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid id and type query are required. Allowed type values: ADMIN, TECHNICIAN, SUPPLIER",
        status: 400,
      });
    }

    const user = type === "ADMIN"
      ? await prisma.admin.findUnique({ where: { id }, select: getManagedUserSelect(type) })
      : type === "TECHNICIAN"
        ? await prisma.staff_Member.findUnique({ where: { id }, select: getManagedUserSelect(type) })
        : await prisma.supplier.findUnique({ where: { id }, select: getManagedUserSelect(type) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        status: 404,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "User data!",
      data: withManagedUserType(type, user),
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

export async function getUserById(req, res) {
  try {
    const id = parseInt(req.params.id);
    const type = normalizeManagedUserType(req.query.type);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid user id is required",
        status: 400,
      });
    }

    const allowedTypes = ["OWNER", "SUPPLIER", "TECHNICIAN"];
    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type is required. Allowed: OWNER, SUPPLIER, TECHNICIAN",
        status: 400,
      });
    }

    let payload = null;

    // 🔹 OWNER
    if (type === "OWNER") {
      const owner = await prisma.user.findUnique({
        where: { id },
        select: getOwnerDashboardSelect(),
      });

      if (owner) {
        payload = await buildOwnerDetailPayload(owner);
      }
    }

    // 🔹 SUPPLIER
    if (type === "SUPPLIER") {
      const supplier = await prisma.supplier.findUnique({
        where: { id },
        select: getSupplierDetailSelect(),
      });

      if (supplier) {
        payload = buildSupplierDetailPayload(supplier);
      }
    }

    // 🔹 TECHNICIAN
    if (type === "TECHNICIAN") {
      const technician = await prisma.staff_Member.findUnique({
        where: { id },
        select: getTechnicianDetailSelect(),
      });

      if (technician) {
        payload = buildTechnicianDetailPayload(technician);
      }
    }

    if (!payload) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        status: 404,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "User data fetched successfully",
      data: payload, // ❌ counts hata diya
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
    });
  }
}

export async function blockUserByAdmin(req, res) {
  try {
    const id = parseInt(req.body.id ?? req.params.id);
    const type = normalizeManagedUserType(req.body.type || req.query.type);
    const schema = Joi.object({
      id: Joi.number().integer().required(),
      type: Joi.string().valid("OWNER", "USER", "TECHNICIAN", "SUPPLIER").required(),
    });

    const result = schema.validate({
      id,
      type,
    });

    if (result.error) {
      const message = result.error?.details?.[0]?.message || "Valid id is required";
      return res.status(400).json({
        success: false,
        message,
        status: 400,
      });
    }

    const userId = result.value.id;
    const normalizedType = result.value.type === "USER" ? "OWNER" : result.value.type;
    let updatedUser = null;
    let message = `${normalizedType} status updated successfully!`;

    if (normalizedType === "OWNER") {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          company_name: true,
          isVerified: true,
          act_token: true,
          createdAt: true,
        },
      });

      if (!owner) {
        return res.status(404).json({
          success: false,
          message: "User not found",
          status: 404,
        });
      }

      const blockedMeta = decodeOwnerBlockedToken(owner.act_token);
      const alreadyBlocked = Boolean(blockedMeta);
      const blocked = !alreadyBlocked;

      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: blocked
          ? {
            isVerified: false,
            act_token: encodeOwnerBlockedToken(owner),
          }
          : {
            isVerified: blockedMeta.wasVerified,
            act_token: blockedMeta.originalToken,
          },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          company_name: true,
          isVerified: true,
          act_token: true,
          createdAt: true,
        },
      });
      message = `${normalizedType} ${blocked ? "blocked" : "unblocked"} successfully!`;
    }

    if (normalizedType === "TECHNICIAN") {
      const technician = await prisma.staff_Member.findUnique({
        where: { id: userId },
        select: getManagedUserSelect("TECHNICIAN"),
      });

      if (!technician) {
        return res.status(404).json({
          success: false,
          message: "User not found",
          status: 404,
        });
      }

      const alreadyBlocked = technician.status === 0;
      const blocked = !alreadyBlocked;
      updatedUser = await prisma.staff_Member.update({
        where: { id: userId },
        data: {
          status: blocked ? 0 : 1,
        },
        select: getManagedUserSelect("TECHNICIAN"),
      });
      message = `${normalizedType} ${blocked ? "blocked" : "unblocked"} successfully!`;
    }

    if (normalizedType === "SUPPLIER") {
      const supplier = await prisma.supplier.findUnique({
        where: { id: userId },
        select: getManagedUserSelect("SUPPLIER"),
      });

      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: "User not found",
          status: 404,
        });
      }

      const alreadyBlocked = supplier.status === 0;
      const blocked = !alreadyBlocked;
      updatedUser = await prisma.supplier.update({
        where: { id: userId },
        data: {
          status: blocked ? 0 : 1,
        },
        select: getManagedUserSelect("SUPPLIER"),
      });
      message = `${normalizedType} ${blocked ? "blocked" : "unblocked"} successfully!`;
    }

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        status: 404,
      });
    }

    const responseData = normalizedType === "OWNER"
      ? formatOwnerListItem(updatedUser)
      : withManagedUserType(normalizedType, updatedUser);

    return res.status(200).json({
      status: 200,
      success: true,
      message,
      data: responseData,
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

export async function unblockUserByAdmin(req, res) {
  return blockUserByAdmin(req, res);
}

export async function getAdminById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid admin id is required",
        status: 400,
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { id },
      select: getManagedUserSelect("ADMIN"),
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
        status: 404,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Admin data!",
      data: withManagedUserType("ADMIN", admin),
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

export async function getTechnicianById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid technician id is required",
        status: 400,
      });
    }

    const technician = await prisma.staff_Member.findUnique({
      where: { id },
      select: getManagedUserSelect("TECHNICIAN"),
    });

    if (!technician) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
        status: 404,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Technician data!",
      data: withManagedUserType("TECHNICIAN", technician),
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

export async function deleteSupplierById(req, res) {
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
      select: { id: true },
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
        status: 404,
      });
    }

    await prisma.supplier.update({
      where: { id },
      data: {
        status: 0,
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Supplier deactivated successfully!",
      data: {},
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

export async function getOwnerById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid owner id is required",
        status: 400,
      });
    }

    const [counts, owner] = await Promise.all([
      getGlobalUserCounts(),
      prisma.user.findUnique({
        where: { id },
        select: getOwnerDashboardSelect(),
      }),
    ]);

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
        status: 404,
      });
    }

    const ownerPayload = await buildOwnerDetailPayload(owner);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Owner data!",
      counts,
      data: ownerPayload,
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

export async function getAllDocks(req, res) {
  try {
    const status = req.query.status?.toString().trim().toLowerCase();
    const allowedStatuses = ["occupied", "available", "avaible"];
    const {
      endOfYesterday,
    } = getDateRanges();
    const endOfYesterdayDate = endOfYesterday.toDate();

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: occupied, available",
        status: 400,
      });
    }

    const now = new Date();
    const [docks, totalDocksYesterdayResult] = await Promise.all([
      prisma.dock.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              company_name: true,
              phone_no: true,
            },
          },
          dockBooking: {
            include: {
              boat: true,
            },
            orderBy: {
              book_from: 'asc',
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
      }),
      prisma.$queryRaw`
        SELECT COUNT(*) AS count
        FROM Dock
        WHERE created_at <= ${endOfYesterdayDate}
      `,
    ]);

    const docksWithStatus = docks.map((dock) => {
      const currentBookings = dock.dockBooking.filter((booking) => {
        return booking.book_from <= now && booking.book_to >= now;
      });
      const dockStatus = currentBookings.length ? "occupied" : "available";

      return {
        id: dock.id,
        dock_name: dock.name,
        location: dock.address,
        rate_per_day: dock.booking_cost_per_day,
        Occupancy: currentBookings.length,
        status: dockStatus,
      };
    });

    const totalDocks = docksWithStatus.length;
    const totalDocksYesterday = Number(totalDocksYesterdayResult?.[0]?.count || 0);
    const totalOccupied = docksWithStatus.filter((dock) => dock.status === "occupied").length;
    const totalAvailable = totalDocks - totalOccupied;
    const normalizedStatus = status === "avaible" ? "available" : status;
    const filteredDocks = normalizedStatus
      ? docksWithStatus.filter((dock) => dock.status === normalizedStatus)
      : docksWithStatus;

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Docks data!",
      counts: {
        totalDocks,
        totalDocks_details: buildDashboardCard(
          "total_docks",
          "Total Docks",
          totalDocks,
          buildDashboardComparison(totalDocks, totalDocksYesterday),
        ),
        totalOccupied,
        totalAvailable,
      },
      data: filteredDocks,
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

export async function getDockByIdForAdmin(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid dock id is required",
        status: 400,
      });
    }

    const now = new Date();
    const dock = await prisma.dock.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
            phone_no: true,
          },
        },
        dockBooking: {
          include: {
            boat: true,
          },
          orderBy: {
            book_from: 'asc',
          },
        },
      },
    });

    if (!dock) {
      return res.status(404).json({
        success: false,
        message: "Dock not found",
        status: 404,
      });
    }

    const currentBookings = dock.dockBooking.filter((booking) => {
      return booking.book_from <= now && booking.book_to >= now;
    });
    const dockStatus = currentBookings.length ? "occupied" : "available";
    const activeBookings = dock.dockBooking.map((booking, index) => ({
      sno: index + 1,
      boat_name: booking.boat?.name ?? null,
      owner_name: booking.boat?.owners_name ?? null,
      start_date: booking.book_from,
      end_date: booking.book_to,
      status: booking.book_from <= now && booking.book_to >= now ? "active" : "upcoming",
    }));

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Dock data!",
      data: {
        id: dock.id,
        dock_name: dock.name,
        storage_address: dock.address,
        email_address: dock.email,
        contact_number: dock.phone_no,
        booking_cost_per_day: dock.booking_cost_per_day,
        status: dockStatus,
        owner_details: dock.user
          ? {
            owner_name: getOwnerDisplayName(dock.user),
            email_address: dock.user.email,
            contact_number: dock.user.phone_no,
          }
          : null,
        active_bookings: activeBookings,
        active_booking: activeBookings,
      },
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

export async function getAllJobs(req, res) {
  try {
    const {
      endOfYesterday,
    } = getDateRanges();
    const endOfYesterdayDate = endOfYesterday.toDate();
    const [tasks, totalJobsYesterdayResult] = await Promise.all([
      prisma.task.findMany({
        include: {
          boat: {
            include: {
              dockBooking: {
                include: {
                  dock: true,
                },
                orderBy: {
                  book_from: "asc",
                },
              },
            },
          },
          staff: true,
          supplier: true,
          JobServiceSheet: {
            orderBy: {
              id: "desc",
            },
          },
        },
        orderBy: [
          { date_scheduled_from: "desc" },
          { id: "desc" },
        ],
      }),
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT taskId) AS count
        FROM JobServiceSheet
        WHERE taskId IS NOT NULL
          AND createdAt <= ${endOfYesterdayDate}
      `,
    ]);

    const formattedJobs = tasks.map(formatJobListResponse);
    const totalJobs = formattedJobs.length;
    const totalJobsYesterday = Number(totalJobsYesterdayResult?.[0]?.count || 0);
    const assignedJobs = formattedJobs.filter((job) => job.status === "assigned").length;
    const inProgressJobs = formattedJobs.filter((job) => job.status === "in progress").length;
    const completedJobs = formattedJobs.filter((job) => job.status === "completed").length;

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Jobs data!",
      counts: {
        total_jobs: totalJobs,
        total_jobs_details: buildDashboardCard(
          "total_jobs",
          "Total Jobs",
          totalJobs,
          buildDashboardComparison(totalJobs, totalJobsYesterday),
        ),
        assigned_jobs: assignedJobs,
        in_progress_jobs: inProgressJobs,
        completed_jobs: completedJobs,
      },
      data: formattedJobs,
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

export async function getJobById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid job id is required",
        status: 400,
      });
    }

    const task = await prisma.task.findFirst({
      where: {
        id,
      },
      include: {
        boat: {
          include: {
            dockBooking: {
              include: {
                dock: true,
              },
              orderBy: {
                book_from: "asc",
              },
            },
          },
        },
        staff: true,
        supplier: true,
        JobServiceSheet: {
          include: {
            Material: true,
          },
          orderBy: {
            id: "desc",
          },
        },
        JobTimerLog: {
          orderBy: {
            timestamp: "desc",
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
        status: 404,
      });
    }

    const formattedJob = formatJobResponse(task);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Job data!",
      data: {
        ...formattedJob,
        timer_logs: task.JobTimerLog.map((log) => ({
          id: log.id,
          type: log.type,
          timestamp: log.timestamp,
        })),
        job_service_sheets: task.JobServiceSheet.map((sheet) => ({
          id: sheet.id,
          job_number: sheet.jobNumber,
          date: sheet.date,
          person_attending: sheet.personAttending,
          customer_name: sheet.customerName,
          mobile: sheet.mobile,
          work_to_be_carried_out: sheet.workToBeCarriedOut,
          work_carried_out: sheet.workCarriedOut,
          document_link: sheet.documentLink,
          materials: sheet.Material.map((material) => ({
            id: material.id,
            material_name: material.materialName,
            units_used: material.unitsUsed,
            price_per_unit: material.pricePerUnit,
            total_price: material.totalPrice,
          })),
        })),
      },
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

export async function getAllBoats(req, res) {
  try {
    const status = req.query.status?.toString().trim().toLowerCase();
    const allowedStatuses = ["assigned", "unassigned"];
    const {
      endOfYesterday,
    } = getDateRanges();
    const endOfYesterdayDate = endOfYesterday.toDate();

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: assigned, unassigned",
        status: 400,
      });
    }

    const now = new Date();
    const [boats, totalBoatsYesterday] = await Promise.all([
      prisma.boat.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              company_name: true,
              phone_no: true,
            },
          },
          dockBooking: {
            include: {
              dock: true,
            },
            orderBy: {
              book_from: 'asc',
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
      }),
      prisma.boat.count({
        where: {
          createdAt: {
            lte: endOfYesterdayDate,
          },
        },
      }),
    ]);

    const boatsWithStatus = boats.map((boat) => {
      const dockBookings = boat.DockBooking.map((booking) => ({
        ...booking,
      }));
      const currentBookings = dockBookings.filter((booking) => {
        return booking.book_from <= now && booking.book_to >= now;
      });
      const boatStatus = dockBookings.length ? "assigned" : "unassigned";
      const { owners_name, ...boatWithoutOwnersName } = boat;

      return {
        ...boatWithoutOwnersName,
        owner_name: owners_name,
        avatar_url: boat.avatar_url ? `${baseurl}/boat/${boat.avatar_url}` : null,
        dockBooking: dockBookings,
        status: boatStatus,
        currentBookings,
        bookedDates: dockBookings.map((booking) => ({
          from: booking.book_from,
          to: booking.book_to,
        })),
      };
    });

    const totalBoats = boatsWithStatus.length;
    const totalAssigned = boatsWithStatus.filter((boat) => boat.status === "assigned").length;
    const totalUnassigned = totalBoats - totalAssigned;
    const filteredBoats = status
      ? boatsWithStatus.filter((boat) => boat.status === status)
      : boatsWithStatus;

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Boats data!",
      counts: {
        totalBoats,
        totalBoats_details: buildDashboardCard(
          "total_boats",
          "Total Boats",
          totalBoats,
          buildDashboardComparison(totalBoats, totalBoatsYesterday),
        ),
        totalAssigned,
        totalUnassigned,
      },
      data: filteredBoats,
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

export async function getBoatByIdForAdmin(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid boat id is required",
        status: 400,
      });
    }

    const now = new Date();
    const boat = await prisma.boat.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
            phone_no: true,
          },
        },
        dockBooking: {
          include: {
            dock: true,
          },
          orderBy: {
            book_from: 'asc',
          },
        },
        Task: {
          include: {
            staff: true,
            supplier: true,
          },
          orderBy: {
            id: 'desc',
          },
        },
        Invoice: {
          orderBy: {
            id: 'desc',
          },
        },
        JobServiceSheet: {
          orderBy: {
            id: 'desc',
          },
        },
      },
    });

    if (!boat) {
      return res.status(404).json({
        success: false,
        message: "Boat not found",
        status: 404,
      });
    }

    const currentBookings = boat.DockBooking.filter((booking) => {
      return booking.book_from <= now && booking.book_to >= now;
    });
    const boatStatus = boat.DockBooking.length ? "assigned" : "unassigned";
    const dockBooking = withDockBookingCalculatedCosts(boat.DockBooking[0] || null);
    const currentBooking = withDockBookingCalculatedCosts(currentBookings[0] || null);
    const completedTasks = boat.Task.filter((task) => task.completed_at);
    const lastServiceDate = completedTasks.length
      ? new Date(Math.max(...completedTasks.map((task) => new Date(task.completed_at))))
      : null;

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Boat data!",
      data: {
        ...boat,
        avatar_url: boat.avatar_url ? `${baseurl}/boat/${boat.avatar_url}` : null,
        dockBooking: dockBooking,
        status: boatStatus,
        currentBooking,
        last_service_date: lastServiceDate,
        bookedDates: boat.DockBooking.map((booking) => ({
          from: booking.book_from,
          to: booking.book_to,
        })),
      },
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

export async function updateManagedUser(req, res) {
  try {
    const type = normalizeManagedUserType(req.body.type || req.query.type);
    const id = parseInt(req.params.id);

    const schema = Joi.object({
      type: Joi.string().valid("ADMIN", "TECHNICIAN", "SUPPLIER").required(),
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().optional(),
      password: Joi.string().min(8).optional(),
      full_name: Joi.string().max(255).optional(),
      first_name: Joi.string().max(255).optional().allow('', null),
      last_name: Joi.string().max(255).optional().allow('', null),
      company_name: Joi.string().optional().allow('', null),
      company_description: Joi.string().optional().allow('', null),
      city: Joi.string().max(255).optional().allow('', null),
      phone_no: Joi.string().max(255).optional().allow('', null),
      company_logo: Joi.string().max(255).optional().allow('', null),
      abn: Joi.string().max(255).optional().allow('', null),
      trade_license: Joi.string().max(255).optional().allow('', null),
      accounting_software_used: Joi.string().optional().allow('', null),
      about_us: Joi.string().optional().allow('', null),
      service_region: Joi.string().optional().allow('', null),
      services_offered: Joi.string().optional().allow('', null),
      complete_profile_status: Joi.number().integer().optional(),
      profile_image: Joi.string().max(255).optional().allow('', null),
      role: Joi.string().max(255).optional(),
      status: Joi.number().integer().optional(),
      userId: Joi.number().integer().optional(),
      home_address: Joi.string().optional().allow('', null),
      hourly_rate: Joi.number().optional(),
      system_deactivation_status: Joi.number().integer().optional(),
    });

    const result = schema.validate({ ...req.body, type });
    if (result.error || Number.isNaN(id)) {
      const message = result.error?.details.map((i) => i.message).join(",") || "Valid id is required";
      return res.status(400).json({
        message,
        error: message,
        missingParams: message,
        status: 400,
        success: false,
      });
    }

    const { email, password, profile_image, ...data } = result.value;
    if (email) {
      const emailAvailable = await assertManagedUserEmailAvailable(type, email, id);
      if (!emailAvailable) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
          status: 400,
        });
      }
    }

    const updateData = {
      ...(email !== undefined && { email }),
      ...(password !== undefined && { password: await argon2.hash(password) }),
    };
    const profileImage = getProfileImageFromRequest(req, profile_image);
    let updatedUser;

    if (type === "ADMIN") {
      updatedUser = await prisma.admin.update({
        where: { id },
        data: {
          ...updateData,
          ...(data.full_name !== undefined && { full_name: data.full_name }),
          ...(data.phone_no !== undefined && { phone_no: data.phone_no }),
          ...(profileImage !== undefined && { profile_image: profileImage }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.status !== undefined && { status: data.status }),
        },
        select: getManagedUserSelect(type),
      });
    }

    if (type === "TECHNICIAN") {
      if (data.userId !== undefined) {
        const ownerUser = await prisma.user.findUnique({
          where: { id: parseInt(data.userId) },
        });

        if (!ownerUser) {
          return res.status(400).json({
            success: false,
            message: "Owner user not found for technician",
            status: 400,
          });
        }
      }

      updatedUser = await prisma.staff_Member.update({
        where: { id },
        data: {
          ...updateData,
          ...(password !== undefined && { showPassword: password }),
          ...(data.full_name !== undefined && { full_name: data.full_name }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.phone_no !== undefined && { phone_no: data.phone_no || "" }),
          ...(data.userId !== undefined && { userId: parseInt(data.userId) }),
          ...(data.hourly_rate !== undefined && { hourly_rate: parseFloat(data.hourly_rate) }),
          ...(data.home_address !== undefined && { home_address: data.home_address || "" }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.system_deactivation_status !== undefined && {
            system_deactivation_status: data.system_deactivation_status,
          }),
        },
        select: getManagedUserSelect(type),
      });
    }

    if (type === "SUPPLIER") {
      if (data.userId !== undefined) {
        const ownerUser = await prisma.user.findUnique({
          where: { id: parseInt(data.userId) },
        });

        if (!ownerUser) {
          return res.status(400).json({
            success: false,
            message: "Owner user not found for supplier",
            status: 400,
          });
        }
      }

      updatedUser = await prisma.supplier.update({
        where: { id },
        data: {
          ...updateData,
          ...(data.first_name !== undefined && { first_name: data.first_name }),
          ...(data.last_name !== undefined && { last_name: data.last_name }),
          ...(data.company_name !== undefined && { company_name: data.company_name }),
          ...(data.company_description !== undefined && { company_description: data.company_description }),
          ...(data.city !== undefined && { city: data.city }),
          ...(data.phone_no !== undefined && { phone_no: data.phone_no }),
          ...(data.company_logo !== undefined && { company_logo: data.company_logo }),
          ...(data.abn !== undefined && { abn: data.abn }),
          ...(data.trade_license !== undefined && { trade_license: data.trade_license }),
          ...(data.accounting_software_used !== undefined && {
            accounting_software_used: data.accounting_software_used,
          }),
          ...(data.about_us !== undefined && { about_us: data.about_us }),
          ...(data.service_region !== undefined && { service_region: data.service_region }),
          ...(data.services_offered !== undefined && { services_offered: data.services_offered }),
          ...(data.complete_profile_status !== undefined && {
            complete_profile_status: data.complete_profile_status,
          }),
          ...(data.status !== undefined && { status: data.status }),
        },
        select: getManagedUserSelect(type),
      });

      if (data.userId !== undefined) {
        await ensureSupplierOwnerLink({
          supplierId: updatedUser.id,
          userId: data.userId,
          fallbackName:
            data.company_name
            || `${data.first_name || ""} ${data.last_name || ""}`.trim()
            || updatedUser.company_name
            || updatedUser.email,
        });
      }
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: `${type} updated successfully!`,
      data: withManagedUserType(type, updatedUser),
    });
  } catch (error) {
    console.log(error);
    if (error?.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "User not found",
        status: 404,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
      error,
    });
  }
}

export async function deleteManagedUser(req, res) {
  try {
    const type = normalizeManagedUserType(req.query.type || req.body.type);
    const id = parseInt(req.params.id);

    if (!["ADMIN", "TECHNICIAN", "SUPPLIER"].includes(type) || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid id and type are required. Allowed type values: ADMIN, TECHNICIAN, SUPPLIER",
        status: 400,
      });
    }

    if (type === "ADMIN") {
      await prisma.admin.delete({ where: { id } });
    } else if (type === "TECHNICIAN") {
      await prisma.staff_Member.delete({ where: { id } });
    } else {
      await prisma.supplier.delete({ where: { id } });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: `${type} deleted successfully!`,
    });
  } catch (error) {
    console.log(error);
    if (error?.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "User not found",
        status: 404,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
      error,
    });
  }
}

export async function inviteManagedUser(req, res) {
  try {
    const type = normalizeManagedUserType(req.body.type);

    const schema = Joi.object({
      type: Joi.string().valid("ADMIN", "TECHNICIAN", "SUPPLIER").required(),
      email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
      full_name: Joi.string().max(255).optional(),
      first_name: Joi.string().max(255).optional().allow('', null),
      last_name: Joi.string().max(255).optional().allow('', null),
      company_name: Joi.string().optional().allow('', null),
      company_description: Joi.string().optional().allow('', null),
      city: Joi.string().max(255).optional().allow('', null),
      phone_no: Joi.string().max(255).optional().allow('', null),
      company_logo: Joi.string().max(255).optional().allow('', null),
      abn: Joi.string().max(255).optional().allow('', null),
      trade_license: Joi.string().max(255).optional().allow('', null),
      accounting_software_used: Joi.string().optional().allow('', null),
      about_us: Joi.string().optional().allow('', null),
      service_region: Joi.string().optional().allow('', null),
      services_offered: Joi.string().optional().allow('', null),
      complete_profile_status: Joi.number().integer().optional(),
      profile_image: Joi.string().max(255).optional().allow('', null),
      role: Joi.string().max(255).optional(),
      userId: Joi.number().integer().optional(),
      home_address: Joi.string().optional().allow('', null),
      hourly_rate: Joi.number().optional(),
      system_deactivation_status: Joi.number().integer().optional(),
    });

    const result = schema.validate({ ...req.body, type });
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

    const {
      email,
      full_name,
      first_name,
      last_name,
      company_name,
      company_description,
      city,
      phone_no,
      company_logo,
      abn,
      trade_license,
      accounting_software_used,
      about_us,
      service_region,
      services_offered,
      complete_profile_status,
      profile_image,
      role,
      userId,
      home_address,
      hourly_rate,
      system_deactivation_status,
    } = result.value;

    if ((type === "TECHNICIAN" || type === "SUPPLIER") && !userId) {
      return res.status(400).json({
        success: false,
        message: `userId is required for ${type.toLowerCase()}`,
        status: 400,
      });
    }

    const emailAvailable = await assertManagedUserEmailAvailable(type, email);
    if (!emailAvailable) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
        status: 400,
      });
    }

    const inviteToken = randomStringAsBase64Url(20);
    const temporaryPassword = randomStringAsBase64Url(12);
    const hashedPassword = await argon2.hash(temporaryPassword);
    const profileImage = getProfileImageFromRequest(req, profile_image);
    let invitedUser;

    if (type === "ADMIN") {
      invitedUser = await prisma.admin.create({
        data: {
          email,
          password: hashedPassword,
          full_name: full_name || `${first_name || ""} ${last_name || ""}`.trim() || "Admin",
          phone_no,
          ...(profileImage !== undefined && { profile_image: profileImage }),
          role: role || "ADMIN",
          token: inviteToken,
        },
        select: getManagedUserSelect(type),
      });
    }

    if (type === "TECHNICIAN") {
      const ownerUser = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
      });

      if (!ownerUser) {
        return res.status(400).json({
          success: false,
          message: "Owner user not found for technician",
          status: 400,
        });
      }

      invitedUser = await prisma.staff_Member.create({
        data: {
          email,
          password: hashedPassword,
          showPassword: null,
          token: inviteToken,
          full_name: full_name || `${first_name || ""} ${last_name || ""}`.trim() || "Technician",
          role: role || "Technician",
          phone_no: phone_no || "",
          userId: parseInt(userId),
          hourly_rate: hourly_rate !== undefined ? parseFloat(hourly_rate) : 0,
          home_address: home_address || "",
          ...(system_deactivation_status !== undefined && { system_deactivation_status }),
        },
        select: getManagedUserSelect(type),
      });
    }

    if (type === "SUPPLIER") {
      const ownerUser = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
      });

      if (!ownerUser) {
        return res.status(400).json({
          success: false,
          message: "Owner user not found for supplier",
          status: 400,
        });
      }

      invitedUser = await prisma.supplier.create({
        data: {
          email,
          password: hashedPassword,
          token: inviteToken,
          first_name,
          last_name,
          company_name,
          company_description,
          city,
          phone_no,
          company_logo,
          abn,
          trade_license,
          accounting_software_used,
          about_us,
          service_region,
          services_offered,
          ...(complete_profile_status !== undefined && { complete_profile_status }),
        },
        select: getManagedUserSelect(type),
      });

      await ensureSupplierOwnerLink({
        supplierId: invitedUser.id,
        userId,
        fallbackName: company_name || `${first_name || ""} ${last_name || ""}`.trim() || email,
      });
    }

    await sendInviteEmail({ email, type, token: inviteToken });

    return res.status(200).json({
      status: 200,
      success: true,
      message: `${type} invited successfully!`,
      data: {
        ...withManagedUserType(type, invitedUser),
        activationLink: getInviteLink(type, inviteToken),
      },
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

export async function getAllSubscriptionsForAdmin(req, res) {
  try {
    const search = req.query.search?.toString().trim().toLowerCase();
    const rawStatusFilter = req.query.status?.toString().trim().toLowerCase();
    const statusFilter = rawStatusFilter === "cancelled" ? "canceled" : rawStatusFilter;
    const planFilter = req.query.plan?.toString().trim().toLowerCase();

    const { endOfYesterday } = getDateRanges();
    const endOfYesterdayDate = endOfYesterday.toDate();

    // ✅ Fetch subscriptions
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
          },
        },
        plan: true,
      },
      orderBy: [
        { start_date: "desc" },
        { created_at: "desc" },
      ],
    });

    // ✅ Map data
    const mappedSubscriptions = subscriptions.map((subscription, index) =>
      buildSubscriptionListItem(subscription, index)
    );

    // ✅ Counts using mapped data (single source of truth)
    const activeSubscriptions = mappedSubscriptions.filter(s => s.status === "active").length;
    const canceledSubscriptions = mappedSubscriptions.filter(s => s.status === "canceled").length;
    const expiredSubscriptions = mappedSubscriptions.filter(s => s.status === "expired").length;

    // ✅ ✅ FIXED MONTHLY REVENUE
    const monthlyRevenue = mappedSubscriptions
      .filter(s => s.status === "active" && s.billing_cycle?.toLowerCase() === "monthly")
      .reduce((total, s) => total + (s.amount || 0), 0);

    // ✅ Yesterday comparisons (keep original logic)
    const activeSubscriptionsYesterday = subscriptions.filter(
      (subscription) =>
        getSubscriptionStatusAtDate(subscription, endOfYesterdayDate) === "active"
    ).length;

    const expiredSubscriptionsYesterday = subscriptions.filter(
      (subscription) =>
        getSubscriptionStatusAtDate(subscription, endOfYesterdayDate) === "expired"
    ).length;

    const monthlyRevenueYesterday = subscriptions
      .filter(sub => {
        const statusAtYesterday = getSubscriptionStatusAtDate(sub, endOfYesterdayDate);
        return statusAtYesterday === "active" &&
          sub.plan?.billingCycle?.toLowerCase() === "monthly";
      })
      .reduce((total, sub) => total + (sub.plan?.price || 0), 0);

    // ✅ Dashboard cards
    const summaryCards = [
      buildDashboardCard(
        "active_subscriptions",
        "Active Subscriptions",
        activeSubscriptions,
        buildDashboardComparison(activeSubscriptions, activeSubscriptionsYesterday)
      ),
      buildDashboardCard(
        "monthly_revenue",
        "Monthly Revenue",
        monthlyRevenue,
        buildDashboardComparison(monthlyRevenue, monthlyRevenueYesterday, { decimals: 2 }),
        { decimals: 2 }
      ),
      buildDashboardCard(
        "expired_subscriptions",
        "Expired",
        expiredSubscriptions,
        buildDashboardComparison(expiredSubscriptions, expiredSubscriptionsYesterday)
      ),
    ];

    const summaryDetails = summaryCards.reduce((acc, card) => {
      acc[card.key] = card;
      return acc;
    }, {});

    const counts = {
      total_subscriptions: mappedSubscriptions.length,
      active_subscriptions: activeSubscriptions,
      canceled_subscriptions: canceledSubscriptions,
      expired_subscriptions: expiredSubscriptions,
      monthly_revenue: formatMetricValue(monthlyRevenue, 2),
      summary_cards: summaryCards,
      summary_details: summaryDetails,
    };

    // ✅ Filters
    const filteredData = mappedSubscriptions.filter((item) => {
      const matchesSearch =
        !search ||
        item.client_name?.toLowerCase().includes(search) ||
        item.plan?.toLowerCase().includes(search);

      const matchesStatus =
        !statusFilter || item.status === statusFilter;

      const matchesPlan =
        !planFilter ||
        item.plan?.toLowerCase().includes(planFilter) ||
        String(item.plan_id) === planFilter;

      return matchesSearch && matchesStatus && matchesPlan;
    });

    // ✅ Response
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Subscriptions data!",
      counts,
      data: filteredData,
    });

  } catch (error) {
    console.log("ERROR IN getAllSubscriptionsForAdmin:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      status: 500,
      error,
    });
  }
}

export async function getSubscriptionByIdForAdmin(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid subscription id is required",
        status: 400,
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
          },
        },
        plan: true,
      },
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
        status: 404,
      });
    }

    const history = await prisma.subscriptionHistory.findMany({
      where: {
        userId: subscription.userId,
      },
      include: {
        plan: true,
      },
      orderBy: [
        { start_date: "desc" },
        { created_at: "desc" },
      ],
    });
    const paymentMethod = await resolveSubscriptionPaymentMethod(subscription);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Subscription data!",
      data: buildSubscriptionDetailPayload(subscription, history, paymentMethod),
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

export async function getAllPlansForAdmin(req, res) {
  try {
    const statusFilter = req.query.status?.toString().trim().toLowerCase();
    const plans = await prisma.plan.findMany({
      orderBy: [
        { name: "asc" },
        { maxStaffUsers: "asc" },
        { billingCycle: "asc" },
      ],
    });

    const groupedPlans = groupPlansForAdmin(plans);
    const filteredPlans = statusFilter
      ? groupedPlans.filter((plan) => plan.status === statusFilter)
      : groupedPlans;

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Plans data!",
      counts: {
        total_plans: groupedPlans.length,
        active_plans: groupedPlans.filter((plan) => plan.status === "active").length,
        disabled_plans: groupedPlans.filter((plan) => plan.status === "disabled").length,
      },
      data: filteredPlans,
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

export async function getPlanByIdForAdmin(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid plan id is required",
        status: 400,
      });
    }

    const groupedPlan = await getPlanGroupById(id);

    if (!groupedPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
        status: 404,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Plan data!",
      data: groupedPlan,
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

export async function addPlanForAdmin(req, res) {
  const schema = Joi.object({
    plan_name: Joi.string().trim().required(),
    monthly_price: Joi.number().positive().required(),
    annually_price: Joi.number().positive().required(),
    max_staff_users: Joi.number().integer().min(1).optional(),
    monthly_stripe_price_id: Joi.string().optional().allow("", null),
    yearly_stripe_price_id: Joi.string().optional().allow("", null),
    plan_description: Joi.string().optional().allow("", null),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    const message = error.details.map((i) => i.message).join(", ");
    return res.status(400).json({
      message,
      missingParams: error.details[0].message,
      status: 400,
      success: false,
    });
  }

  try {
    const maxStaffUsers = inferMaxStaffUsers(value.plan_name, value.max_staff_users);

    const existingPlans = await prisma.plan.findMany({
      where: {
        name: value.plan_name,
        maxStaffUsers: maxStaffUsers,
      },
    });

    if (existingPlans.length) {
      return res.status(400).json({
        success: false,
        message: "Plan with same name already exists",
        status: 400,
      });
    }

    const createdPlans = await prisma.$transaction([
      prisma.plan.create({
        data: {
          name: value.plan_name,
          price: value.monthly_price,
          billingCycle: "Monthly",
          maxStaffUsers: maxStaffUsers,
          stripePriceId: value.monthly_stripe_price_id || null,
        },
      }),
      prisma.plan.create({
        data: {
          name: value.plan_name,
          price: value.annually_price,
          billingCycle: "Yearly",
          maxStaffUsers: maxStaffUsers,
          stripePriceId: value.yearly_stripe_price_id || null,
        },
      }),
    ]);

    const groupedPlan = groupPlansForAdmin(createdPlans)[0];

    return res.status(201).json({
      status: 201,
      success: true,
      message: "Plan created successfully!",
      data: groupedPlan,
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

export async function updatePlanForAdmin(req, res) {
  const schema = Joi.object({
    monthly_price: Joi.number().positive().required(),
    annually_price: Joi.number().positive().required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    const message = error.details.map((i) => i.message).join(", ");
    return res.status(400).json({
      message,
      missingParams: error.details[0].message,
      status: 400,
      success: false,
    });
  }

  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid plan id is required",
        status: 400,
      });
    }

    const currentPlan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!currentPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
        status: 404,
      });
    }

    const siblingPlans = await prisma.plan.findMany({
      where: {
        name: currentPlan.name,
        maxStaffUsers: currentPlan.maxStaffUsers,
      },
    });

    const monthlyPlan = siblingPlans.find((plan) => normalizeBillingCycle(plan.billingCycle) === "Monthly");
    const yearlyPlan = siblingPlans.find((plan) => normalizeBillingCycle(plan.billingCycle) === "Yearly");

    await prisma.$transaction([
      monthlyPlan
        ? prisma.plan.update({
          where: { id: monthlyPlan.id },
          data: {
            price: value.monthly_price,
          },
        })
        : prisma.plan.create({
          data: {
            name: currentPlan.name,
            price: value.monthly_price,
            billingCycle: "Monthly",
            maxStaffUsers: currentPlan.maxStaffUsers,
            stripePriceId: currentPlan.stripePriceId,
          },
        }),
      yearlyPlan
        ? prisma.plan.update({
          where: { id: yearlyPlan.id },
          data: {
            price: value.annually_price,
          },
        })
        : prisma.plan.create({
          data: {
            name: currentPlan.name,
            price: value.annually_price,
            billingCycle: "Yearly",
            maxStaffUsers: currentPlan.maxStaffUsers,
            stripePriceId: currentPlan.stripePriceId,
          },
        }),
    ]);

    const updatedGroup = await getPlanGroupById(monthlyPlan?.id || yearlyPlan?.id || id);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Plan updated successfully!",
      data: updatedGroup,
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

export async function disablePlanForAdmin(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid plan id is required",
        status: 400,
      });
    }

    const plan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
        status: 404,
      });
    }

    await prisma.plan.updateMany({
      where: {
        name: plan.name,
        maxStaffUsers: plan.maxStaffUsers,
      },
      data: {
        stripePriceId: null,
      },
    });

    const groupedPlan = await getPlanGroupById(id);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Plan disabled successfully!",
      data: groupedPlan,
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

export async function deletePlanForAdmin(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid plan id is required",
        status: 400,
      });
    }

    const plan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
        status: 404,
      });
    }

    const relatedPlans = await prisma.plan.findMany({
      where: {
        name: plan.name,
        maxStaffUsers: plan.maxStaffUsers,
      },
      select: {
        id: true,
      },
    });

    const relatedPlanIds = relatedPlans.map((item) => item.id);

    const [subscriptionCount, historyCount] = await Promise.all([
      prisma.subscription.count({
        where: {
          planId: {
            in: relatedPlanIds,
          },
        },
      }),
      prisma.subscriptionHistory.count({
        where: {
          planId: {
            in: relatedPlanIds,
          },
        },
      }),
    ]);

    if (subscriptionCount || historyCount) {
      return res.status(400).json({
        success: false,
        message: "Plan is linked with subscriptions. Please disable it instead of deleting.",
        status: 400,
      });
    }

    await prisma.plan.deleteMany({
      where: {
        name: plan.name,
        maxStaffUsers: plan.maxStaffUsers,
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Plan deleted successfully!",
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

export async function getDashboard(req, res) {
  try {
    const {
      startOfToday,
      endOfToday,
      startOfYesterday,
      endOfYesterday,
    } = getDateRanges();
    const startOfTodayDate = startOfToday.toDate();
    const endOfTodayDate = endOfToday.toDate();
    const startOfYesterdayDate = startOfYesterday.toDate();
    const endOfYesterdayDate = endOfYesterday.toDate();

    const [
      totalOwners,
      ownersCreatedToday,
      ownersCreatedYesterday,
      totalTechnicians,
      techniciansCreatedToday,
      techniciansCreatedYesterday,
      totalSuppliers,
      suppliersCreatedToday,
      suppliersCreatedYesterday,
      totalBoats,
      boatsCreatedToday,
      boatsCreatedYesterday,
      totalDocks,
      docksCreatedTodayResult,
      docksCreatedYesterdayResult,
      revenueAggregate,
      revenueAggregateToday,
      revenueAggregateYesterday,
      recentOwners,
      recentTechnicians,
      recentSuppliers,
      currentSubscriptions,
      subscriptionHistoryRecords,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: startOfTodayDate,
            lte: endOfTodayDate,
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: startOfYesterdayDate,
            lte: endOfYesterdayDate,
          },
        },
      }),
      prisma.staff_Member.count(),
      prisma.staff_Member.count({
        where: {
          createdAt: {
            gte: startOfTodayDate,
            lte: endOfTodayDate,
          },
        },
      }),
      prisma.staff_Member.count({
        where: {
          createdAt: {
            gte: startOfYesterdayDate,
            lte: endOfYesterdayDate,
          },
        },
      }),
      prisma.supplier.count(),
      prisma.supplier.count({
        where: {
          createdAt: {
            gte: startOfTodayDate,
            lte: endOfTodayDate,
          },
        },
      }),
      prisma.supplier.count({
        where: {
          createdAt: {
            gte: startOfYesterdayDate,
            lte: endOfYesterdayDate,
          },
        },
      }),
      prisma.boat.count(),
      prisma.boat.count({
        where: {
          createdAt: {
            gte: startOfTodayDate,
            lte: endOfTodayDate,
          },
        },
      }),
      prisma.boat.count({
        where: {
          createdAt: {
            gte: startOfYesterdayDate,
            lte: endOfYesterdayDate,
          },
        },
      }),
      prisma.dock.count(),
      prisma.$queryRaw`
        SELECT COUNT(*) AS count
        FROM Dock
        WHERE created_at >= ${startOfTodayDate} AND created_at <= ${endOfTodayDate}
      `,
      prisma.$queryRaw`
        SELECT COUNT(*) AS count
        FROM Dock
        WHERE created_at >= ${startOfYesterdayDate} AND created_at <= ${endOfYesterdayDate}
      `,
      prisma.invoice.aggregate({
        _sum: {
          totalAmountAfterTax: true,
        },
      }),
      prisma.invoice.aggregate({
        where: {
          createdAt: {
            gte: startOfTodayDate,
            lte: endOfTodayDate,
          },
        },
        _sum: {
          totalAmountAfterTax: true,
        },
      }),
      prisma.invoice.aggregate({
        where: {
          createdAt: {
            gte: startOfYesterdayDate,
            lte: endOfYesterdayDate,
          },
        },
        _sum: {
          totalAmountAfterTax: true,
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          company_name: true,
          isVerified: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }),
      prisma.staff_Member.findMany({
        select: {
          id: true,
          full_name: true,
          email: true,
          status: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }),
      prisma.supplier.findMany({
        select: {
          id: true,
          first_name: true,
          last_name: true,
          company_name: true,
          email: true,
          status: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }),
      prisma.subscription.findMany({
        select: {
          id: true,
          created_at: true,
          start_date: true,
          renewed_at: true,
          canceled_at: true,
          trial_end_date: true,
          failed_at: true,
          sub_status: true,
        },
      }),
      prisma.subscriptionHistory.findMany({
        select: {
          id: true,
          created_at: true,
          start_date: true,
          renewed_at: true,
          canceled_at: true,
          trial_end_date: true,
          failed_at: true,
          sub_status: true,
        },
      }),
    ]);

    const totalUsers = totalOwners + totalTechnicians + totalSuppliers;
    const usersCreatedToday =
      ownersCreatedToday + techniciansCreatedToday + suppliersCreatedToday;
    const usersCreatedYesterday =
      ownersCreatedYesterday + techniciansCreatedYesterday + suppliersCreatedYesterday;
    const docksCreatedToday = Number(docksCreatedTodayResult?.[0]?.count || 0);
    const docksCreatedYesterday = Number(docksCreatedYesterdayResult?.[0]?.count || 0);
    const totalRevenue = formatMetricValue(revenueAggregate._sum.totalAmountAfterTax, 2);
    const revenueCreatedToday = formatMetricValue(revenueAggregateToday._sum.totalAmountAfterTax, 2);
    const revenueCreatedYesterday = formatMetricValue(revenueAggregateYesterday._sum.totalAmountAfterTax, 2);
    const recentUsers = [
      ...recentOwners.map(formatOwnerListItem),
      ...recentTechnicians.map(formatTechnicianListItem),
      ...recentSuppliers.map(formatSupplierListItem),
    ]
      .sort((a, b) => new Date(b.date_joined) - new Date(a.date_joined))
      .slice(0, 5);
    const overviewCards = [
      buildDashboardCard(
        "total_user",
        "Total User",
        totalUsers,
        buildDashboardComparison(usersCreatedToday, usersCreatedYesterday, {
          upLabel: "Up for yesterday",
          downLabel: "Down for yesterday",
        }),
      ),
      buildDashboardCard(
        "total_boats",
        "Total Boats",
        totalBoats,
        buildDashboardComparison(boatsCreatedToday, boatsCreatedYesterday, {
          upLabel: "Up for yesterday",
          downLabel: "Down for yesterday",
        }),
      ),
      buildDashboardCard(
        "total_docks",
        "Total Docks",
        totalDocks,
        buildDashboardComparison(docksCreatedToday, docksCreatedYesterday, {
          upLabel: "Up for yesterday",
          downLabel: "Down for yesterday",
        }),
      ),
      buildDashboardCard(
        "total_revenue",
        "Total Revenue",
        totalRevenue,
        buildDashboardComparison(revenueCreatedToday, revenueCreatedYesterday, {
          decimals: 2,
          upLabel: "Up for yesterday",
          downLabel: "Down for yesterday",
        }),
        { decimals: 2 },
      ),
    ];
    const subscriptionHistoryGraph = buildSubscriptionHistoryGraph(
      currentSubscriptions,
      subscriptionHistoryRecords,
    );
    const metricDetails = overviewCards.reduce((accumulator, card) => {
      accumulator[card.key] = card;
      return accumulator;
    }, {});

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Admin dashboard data!",
      data: {
        total_user: totalUsers,
        total_boats: totalBoats,
        total_docks: totalDocks,
        total_revenue: totalRevenue,
        overview_cards: overviewCards,
        metric_details: metricDetails,
        recent_users: recentUsers,
        subscription_history: {
          range: "last_12_months",
          summary: {
            current_subscriptions: currentSubscriptions.length,
            subscription_history_records: subscriptionHistoryRecords.length,
          },
          graph: subscriptionHistoryGraph,
        },
      },
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

export async function getAllUsers(req, res) {
  try {
    const type = normalizeManagedUserType(req.query.type);
    const allowedTypes = ["OWNER", "USER", "ADMIN", "TECHNICIAN", "SUPPLIER"];

    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Allowed values: OWNER, USER, ADMIN, TECHNICIAN, SUPPLIER",
        status: 400,
      });
    }

    const ownerQuery = () => prisma.user.findMany({
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        company_name: true,
        isVerified: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const technicianQuery = () => prisma.staff_Member.findMany({
      select: {
        id: true,
        full_name: true,
        email: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const supplierQuery = () => prisma.supplier.findMany({
      select: {
        id: true,
        first_name: true,
        last_name: true,
        company_name: true,
        email: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (type === "ADMIN") {
      const [counts, users] = await Promise.all([
        getGlobalUserCounts(),
        prisma.admin.findMany({
          select: getManagedUserSelect("ADMIN"),
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return res.status(200).json({
        status: 200,
        success: true,
        message: "Users data!",
        counts,
        data: users.map((user) => withManagedUserType("ADMIN", user)),
      });
    }

    if (type === "OWNER" || type === "USER") {
      const [counts, users] = await Promise.all([getGlobalUserCounts(), ownerQuery()]);

      return res.status(200).json({
        status: 200,
        success: true,
        message: "Users data!",
        counts,
        data: users.map(formatOwnerListItem),
      });
    }

    if (type === "TECHNICIAN") {
      const [counts, users] = await Promise.all([getGlobalUserCounts(), technicianQuery()]);

      return res.status(200).json({
        status: 200,
        success: true,
        message: "Users data!",
        counts,
        data: users.map(formatTechnicianListItem),
      });
    }

    if (type === "SUPPLIER") {
      const [counts, users] = await Promise.all([getGlobalUserCounts(), supplierQuery()]);

      return res.status(200).json({
        status: 200,
        success: true,
        message: "Users data!",
        counts,
        data: users.map(formatSupplierListItem),
      });
    }

    const [counts, owners, technicians, suppliers] = await Promise.all([
      getGlobalUserCounts(),
      ownerQuery(),
      technicianQuery(),
      supplierQuery(),
    ]);

    const data = [
      ...owners.map(formatOwnerListItem),
      ...technicians.map(formatTechnicianListItem),
      ...suppliers.map(formatSupplierListItem),
    ].sort((a, b) => new Date(b.date_joined) - new Date(a.date_joined));

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Users data!",
      counts,
      data,
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

export async function getAllStaff(req, res) {
  try {
    const staffMembers = await prisma.staff_Member.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        full_name: true,
        home_address: true,
        userId: true,
        status: true,
        hourly_rate: true,
        system_deactivation_status: true,
        phone_no: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Staff data!",
      data: staffMembers,
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

export async function getAllSuppliers(req, res) {
  try {
    const suppliers = await prisma.supplier.findMany({
      select: getManagedUserSelect("SUPPLIER"),
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Suppliers data!",
      data: suppliers.map((supplier) => withManagedUserType("SUPPLIER", supplier)),
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

export async function getAllNotificationsForAdmin(req, res) {
  try {
    const { search } = req.query;
    const searchValue = search?.toString().trim();

    const notificationWhere = {
      ...(searchValue
        ? {
          OR: [
            { content: { contains: searchValue } },
            { type: { contains: searchValue } },
          ],
        }
        : {}),
    };

    const [notifications, recentSignups, recentSubscriptions] = await Promise.all([
      prisma.notification.findMany({
        where: notificationWhere,
        include: {
          byStaff: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
          task: {
            select: {
              id: true,
              description: true,
              jobNumber: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.user.findMany({
        where: searchValue
          ? {
            OR: [
              { first_name: { contains: searchValue } },
              { last_name: { contains: searchValue } },
              { company_name: { contains: searchValue } },
              { email: { contains: searchValue } },
            ],
          }
          : undefined,
        select: {
          id: true,
          first_name: true,
          last_name: true,
          company_name: true,
          email: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      }),
      prisma.subscription.findMany({
        where: searchValue
          ? {
            OR: [
              { user: { first_name: { contains: searchValue } } },
              { user: { last_name: { contains: searchValue } } },
              { user: { company_name: { contains: searchValue } } },
              { user: { email: { contains: searchValue } } },
              { plan: { name: { contains: searchValue } } },
            ],
          }
          : undefined,
        include: {
          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              company_name: true,
              email: true,
            },
          },
          plan: {
            select: {
              name: true,
              billingCycle: true,
              price: true,
            },
          },
        },
        orderBy: [
          { renewed_at: "desc" },
          { start_date: "desc" },
          { created_at: "desc" },
        ],
        take: 50,
      }),
    ]);

    const taskNotifications = notifications.map(buildAdminNotificationItem);
    const signupNotifications = recentSignups.map(buildSignupNotificationItem);
    const subscriptionNotifications = recentSubscriptions.map(buildSubscriptionPurchaseNotificationItem);

    const allNotifications = [
      ...taskNotifications,
      ...signupNotifications,
      ...subscriptionNotifications,
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const unread_count = allNotifications.filter((item) => item.is_read === false).length;
    const total = allNotifications.length;

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Notifications data!",
      counts: {
        total,
        unread_count,
        read_count: total - unread_count,
      },
      data: allNotifications,
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
export const sendEODReport = async (req, res) => {
  try {
    const { eodReportContent } = req.body;

    if (!eodReportContent) {
      return res.status(400).json({
        success: false,
        message: "EOD report content is required",
        status: 400,
      });
    }

    const mailOptions = {
      from: "yashraj.ctinfotech@gmail.com",
      to: "hr@ctinfotech.com.au", // Replace with actual HR email
      subject: "Marine Manager - EOD Report",
      template: "eod_report",
      context: {
        eodReportContent: eodReportContent,
      },
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: "EOD report sent successfully",
      status: 200,
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
};
