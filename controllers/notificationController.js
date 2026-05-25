import { PrismaClient } from "@prisma/client";
import path from 'path'
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { MessageEnum } from "../config/message.js";
import { getDateRanges } from "../utils/helper.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";

dotenv.config();
const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getMyNotifications(req, res) {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const { endOfYesterday} =  getDateRanges()
        const total = await prisma.notification.count({
            where: {
                toUserId: req.user.id,
                createdAt: {
                    gte: endOfYesterday, // Notifications from yesterday
                },
            },
        })
        const notifications = await prisma.notification.findMany({
            where: {
                toUserId: req.user.id,
                createdAt: {
                    gte: endOfYesterday, // Notifications from yesterday
                },

            },
            include: {
                byStaff: true,
                task:true,
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip: parseInt((page - 1) * limit), take: parseInt(limit),
        });
        const unRead = await prisma.notification.count({
            where: {
                toUserId: req.user.id,
                createdAt: {
                    gte: endOfYesterday, // Notifications from yesterday
                },
                isRead: false
            },
        })
        return createSuccessResponse(res,200,true,MessageEnum.NOTIFICATION_DATA,{notifications,total,unRead});
        
    } catch (error) {
        console.log(error);
        return createErrorResponse(res,500,MessageEnum.INTERNAL_SERVER_ERROR);

    }

}

export async function markAsRead(req, res) {
    try {
        const { id } = req.params;

        await prisma.notification.update({
            where: {
                id: parseInt(id),
                toUserId: req.user.id
            },
            data: {
                isRead: true
            }
        })
        return createSuccessResponse(res,200,true,MessageEnum.NOTIFICATION_DATA);
        
    } catch (error) {
        console.log(error);
        return createErrorResponse(res,500,MessageEnum.INTERNAL_SERVER_ERROR);

    }
}

export async function markAllRead(req, res) {
    try {
        await prisma.notification.updateMany({
            where: {
                toUserId: req.user.id
            },
            data: {
                isRead: true
            }
        })
        return createSuccessResponse(res,200,true,MessageEnum.NOTIFICATION_DATA);
        
    } catch (error) {
        console.log(error);
        return createErrorResponse(res,500,MessageEnum.INTERNAL_SERVER_ERROR);

    }
}
