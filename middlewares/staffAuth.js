import jwt from 'jsonwebtoken';
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();
const prisma = new PrismaClient();


export async function staffAuth(req, res, next) {
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
    console.log(token);
    console.log(secretKey);
    // Verify the token
    const decoded = jwt.verify(token, secretKey);
    console.log(decoded);
    const user = await prisma.staff_Member.findUnique({
      where: {
        id: decoded.staffId,
      },
    })
    if (user) {
      if (user.status === 0) {
        return res.status(403).json({
          message: "Your account has been blocked by the administrator. Please contact support for further assistance.",
          status: 403,
          success: false,
        });
      }

      if (user.system_deactivation_status === 0) {
        return res.status(403).json({
          message: "Your account has been blocked by the Service Hub. Please contact support for further assistance.",
          status: 403,
          success: false,
        });
      }

      req.user = user;
      next();
    }
    else {
      return res.status(403).json({
        message: "Access Forbidden",
        status: 401,
        success: false,
      });
    }
  } catch (error) {
    return res.status(403).json({
      message: "Access forbidden",
      status: 401,
      success: false,
    });

  }

}

