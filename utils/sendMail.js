import nodemailer from "nodemailer";
import path from "path";
import hbs from "nodemailer-express-handlebars";
import { fileURLToPath } from 'url';
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var transporter = nodemailer.createTransport({
  host: "email-smtp.ap-southeast-2.amazonaws.com",
  port: 465,
  auth: {
    user: "AKIATRNH4WSLN3EJRKHX",
    pass: "BGInerDiW6ZTl62fSQ45ueA2Eg8pZ1G/Si1FAOH+9t5f",
  },
  tls: {
    rejectUnauthorized: false, // This allows self-signed certificates
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

export const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("email sent", info?.messageId || "");
    return info;
  } catch (error) {
    console.log("email send error", error);
    throw error;
  }
};
