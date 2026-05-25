import { PrismaClient } from "@prisma/client";
import path from 'path'
import dotenv from "dotenv";
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import hbs from "nodemailer-express-handlebars";
dotenv.config();
const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
var transporter = nodemailer.createTransport({
    // service: 'gmail',
    host: "smtp.gmail.com",
    port: 587,
    // secure: true,
    auth: {
        // MVP1 Ventures
        user: "yashraj.ctinfotech@gmail.com",
        pass: "ddiy zydh toma texm",
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

export async function sendEmail(mailOptions) {
    return transporter.sendMail(mailOptions, async function (error, info) {
        if (error) {
            console.log("error", error)
        } else {
            console.log("success")
        }
    });
};