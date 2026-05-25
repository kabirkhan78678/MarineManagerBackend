import { PrismaClient } from '@prisma/client';
import Joi from "joi";
import { MessageEnum } from "../config/message.js";
import dotenv from 'dotenv';
dotenv.config();
const baseurl = process.env.BASE_URL;
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
import { getDateRanges } from '../utils/helper.js';
const prisma = new PrismaClient();

function roundToTwo(value) {
    return Number((value || 0).toFixed(2));
}

function getJobDistributionSummary(tasks) {
    const now = new Date();
    const totalTasks = tasks.length;

    // Use the same simple logic as taskController.js: status < 4 means pending
    const completed = tasks.filter((task) => task.status === 4).length;
    const pending = tasks.filter((task) => task.status < 4).length;
    const inProgress = 0; // Simplified for now
    const delayed = 0; // Simplified for now

    const toPercentage = (count) => totalTasks === 0 ? 0 : roundToTwo((count / totalTasks) * 100);

    return {
        total_tasks: totalTasks,
        completed: {
            count: completed,
            percentage: toPercentage(completed),
        },
        delayed: {
            count: delayed,
            percentage: toPercentage(delayed),
        },
        pending: {
            count: pending,
            percentage: toPercentage(pending),
        },
        in_progress: {
            count: inProgress,
            percentage: toPercentage(inProgress),
        }
    };
}

function buildRevenueOverview(invoices) {
    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyRevenue = Array.from({ length: 12 }, (_, index) => ({
        month: monthLabels[index],
        month_index: index,
        revenue: 0,
    }));

    invoices.forEach((invoice) => {
        const createdAt = new Date(invoice.createdAt);
        const monthIndex = createdAt.getMonth();
        monthlyRevenue[monthIndex].revenue += Number(invoice.totalAmountAfterTax || 0);
    });

    return {
        range: "yearly",
        year: new Date().getFullYear(),
        graph: monthlyRevenue.map((item) => ({
            ...item,
            revenue: roundToTwo(item.revenue),
        })),
    };
}

export const getDashBoard = async (req, res) => {
    try {

        const currentDate = new Date();

        const timeZone = 'Asia/Kolkata';
        const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } = getDateRanges(timeZone);

        // Logging the results
        console.log("startOfToday:", startOfToday.format()); // Outputs in ISO format
        console.log("endOfToday:", endOfToday.format());     // Outputs in ISO format
        console.log("startOfTomorrow:", startOfTomorrow.format()); // Outputs in ISO format

        const currentlyInServicePromise = prisma.boat.count({
            where: {
                userId: req.user.id,
                book_to: {
                    gte: startOfToday.format(),
                    lt: endOfToday.format()
                },
            },
        });

        const boatsInQueuePromise = prisma.boat.count({
            where: {
                userId: req.user.id,
                book_to: {
                    gte: startOfTomorrow.format(),
                },
            },
        });

        const boatsUnderMaintanencePromise = prisma.boat.findMany({
            where: {
                userId: req.user.id,
                book_to: {
                    gte: startOfToday.format()
                }
            },
            orderBy: {
                book_to: 'asc'
            },
            take: 4
        });

        const startOfTomorrowISOString = startOfTomorrow.toISOString();
        console.log("startOfTomorrow", startOfTomorrowISOString)
        const tasksForTommorrowPromise = prisma.task.findMany({
            where: {
                userId: req.user.id,
                date_scheduled_to: {
                    gte: startOfTomorrow.format(),
                    lt: endOfTomorrow.format()
                },
                status: 0
            },
            include: {
                boat: true,
                supplier: true,
                staff: true
            },
            orderBy: {
                id: 'desc',
            },
            take: 4
        });

        // const taskWithStaffMember = await prisma.task.findMany({
        //     where: {
        //      userId:req.user.id,
        //      supplierId:null,
        //      assignStaffId:{
        //         not:null
        //      }

        //     },
        //     include:{
        //       staff:true,
        //       boat:true
        //     },
        //     orderBy: {
        //       id: 'desc'
        //     }
        //   });

        const taskWithStaffMemberPromise = prisma.task.findMany({
            where: {
                userId: req.user.id,
                supplierId: null,
                assignStaffId: {
                    not: null
                }

            },
            include: {
                staff: true,
                boat: true,
                JobTimerLog: true,
            },
            orderBy: {
                completed_at: 'desc'
            }
        });

        const [
            currentlyInService,
            boatsInQueue,
            boatsUnderMaintanence,
            leadCount,
            tasksForTommorrow,
            taskWithStaffMember,
            totalStaffMembers,
            staffMembersWithTasks,
            totalInvoiceAmount,
            totalBoats,
            totalStaff,
            unpaidInvoices,
            activeDockBookings,
            allTasks,
            revenueOverviewInvoices
        ] = await Promise.all([
            currentlyInServicePromise,
            boatsInQueuePromise,
            boatsUnderMaintanencePromise,
            prisma.quickLeads.count({
                where: {
                    userId: req.user.id
                }
            }),
            tasksForTommorrowPromise,
            taskWithStaffMemberPromise,
            prisma.staff_Member.count({
                where: {
                    userId: req.user.id,
                }
            }),
            prisma.staff_Member.count({
                where: {
                    userId: req.user.id,
                    Task: {
                        some: {}
                    }
                }
            }),
            prisma.invoice.findMany({
                where: {
                    userId: req.user.id
                },
                select: {
                    totalAmountAfterTax: true
                }
            }),
            prisma.boat.count({
                where: {
                    userId: req.user.id
                }
            }),
            prisma.staff_Member.count({
                where: {
                    userId: req.user.id,
                    status: 1,
                    system_deactivation_status: 1
                }
            }),
            prisma.invoice.count({
                where: {
                    userId: req.user.id,
                    status: 0
                }
            }),
            prisma.dockBooking.findMany({
                where: {
                    userId: req.user.id,
                    book_from: {
                        lte: currentDate
                    },
                    book_to: {
                        gte: currentDate
                    }
                },
                select: {
                    dockId: true
                },
                distinct: ['dockId']
            }),
            prisma.task.findMany({
                where: {
                    userId: req.user.id
                },
                select: {
                    id: true,
                    status: true,
                    timer_status: true,
                    completed_at: true,
                    date_scheduled_to: true
                }
            }),
            prisma.invoice.findMany({
                where: {
                    userId: req.user.id,
                    createdAt: {
                        gte: new Date(new Date().getFullYear(), 0, 1),
                        lt: new Date(new Date().getFullYear() + 1, 0, 1)
                    }
                },
                select: {
                    createdAt: true,
                    totalAmountAfterTax: true
                }
            })
        ]);

        await Promise.all(taskWithStaffMember.map((task) => {
            task.total_active_minutes = calculateTotalActiveMinutes(task.JobTimerLog)
        }))

        boatsUnderMaintanence.map((item) => {
            item.avatar_url = item.avatar_url ? baseurl + "/boat/" + item.avatar_url : null
            return item
        })

        const totalAmountForUser = totalInvoiceAmount.reduce((sum, invoice) => sum + invoice.totalAmountAfterTax, 0);
        const jobDistribution = getJobDistributionSummary(allTasks);
        const revenueOverview = buildRevenueOverview(revenueOverviewInvoices);
        const dashboardCards = {
            total_revenue: roundToTwo(totalAmountForUser),
            total_boats: totalBoats,
            active_docks: activeDockBookings.length,
            total_staff: totalStaff,
            unpaid_invoices: unpaidInvoices,
        };
        const actionRequired = {
            pending_tasks: jobDistribution.pending.count,
            delayed_jobs: jobDistribution.delayed.count,
            unpaid_invoices: dashboardCards.unpaid_invoices,
        };

        console.log("Total Invoice Amount After Tax for User:", totalAmountForUser);

        return createSuccessResponse(res, 200, true, MessageEnum.DASHBOARD_DATA, {
            currentlyInService,
            boatsInQueue,
            boatsUnderMaintanence,
            leadCount,
            tasksForTommorrow,
            staffMembersWithTasks,
            totalStaffMembers,
            taskWithStaffMember,
            totalAmountForUser: roundToTwo(totalAmountForUser),
            dashboard_cards: dashboardCards,
            action_required: actionRequired,
            job_distribution: jobDistribution,
            revenue_overview: revenueOverview
        });
    } catch (error) {
        console.log(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};

export const tasksForTommorrow = async (req, res) => {
    try {

        const currentDate = new Date();

        const timeZone = 'Asia/Kolkata';
        const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } = getDateRanges(timeZone);

        // Logging the results
        console.log("startOfToday:", startOfToday.format()); // Outputs in ISO format
        console.log("endOfToday:", endOfToday.format());     // Outputs in ISO format
        console.log("startOfTomorrow:", startOfTomorrow.format()); // Outputs in ISO format

        const startOfTomorrowISOString = startOfTomorrow.toISOString();
        console.log("startOfTomorrow", startOfTomorrowISOString)
        const tasksForTommorrow = await prisma.task.findMany({
            where: {
                userId: req.user.id,
                date_scheduled_to: {
                    gte: startOfTomorrow.format(),
                    lt: endOfTomorrow.format()
                },
                status: 0
            },
            include: {
                boat: true,
                supplier: true,
                staff: true
            },
            orderBy: {
                id: 'desc',
            },
        });



        return createSuccessResponse(res, 200, true, MessageEnum.TASK_DATA, tasksForTommorrow);
    } catch (error) {
        console.log(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);
    }
};
export async function getAllStaffMembers(req, res) {
    try {

        const staffMembers = await prisma.staff_Member.findMany({
            where: {
                userId: req.user.id,
                Task: {
                    some: {}
                }
            },
            include: {
                Task: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        const totalStaffMembers = await prisma.staff_Member.count({
            where: {
                userId: req.user.id,

            }
        })

        const staffMembersWithTasks = await prisma.staff_Member.count({
            where: {
                userId: req.user.id,
                Task: {
                    some: {}
                }
            }
        })

        return createSuccessResponse(res, 200, true, MessageEnum.STAFF_MEMBER_DATA, { staffMembers, totalStaffMembers, staffMembersWithTasks });

    } catch (error) {
        console.log(error);
        return createErrorResponse(res, 500, MessageEnum.INTERNAL_SERVER_ERROR);

    }
}

function calculateTotalActiveMinutes(logs) {
    let totalMs = 0;
    let lastStart = null;

    logs.forEach((log, i) => {
        const ts = new Date(log.timestamp);

        if (log.type === "START" || log.type === "RESUME") {
            lastStart = ts;
        }

        if ((log.type === "PAUSE" || log.type === "COMPLETE") && lastStart) {
            totalMs += ts - lastStart;
            lastStart = null; // reset until next START/RESUME
        }

        // If it's the last log and still running (STARTED/RESUMED)
        if (i === logs.length - 1 && lastStart) {
            totalMs += new Date() - lastStart;
        }
    });

    return Math.floor(totalMs / 60000); // minutes
}
