import jwt from 'jsonwebtoken';
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

export async function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    const secretKey = process.env.SECRET_KEY;

    if (!header) {
      return res.status(401).json({
        message: "Token Not Provided",
        status: 400,
        success: false,
      });
    }

    const [bearer, token] = header.split(' ');
    if (bearer !== 'Bearer' || !token) {
      return res.status(401).json({
        message: "Invalid token format",
        status: 401,
        success: false,
      });
    }

    const decoded = jwt.verify(token, secretKey);
    const admin = await prisma.admin.findUnique({
      where: {
        id: decoded.adminId,
      },
    });

    if (!admin || admin.status !== 1) {
      return res.status(403).json({
        message: "Access Forbidden",
        status: 401,
        success: false,
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(403).json({
      message: "Access forbidden",
      status: 401,
      success: false,
    });
  }
}
