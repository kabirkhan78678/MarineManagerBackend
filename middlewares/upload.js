import multer from 'multer';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/boat/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    },
});

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 200 * 1024 * 1024 // 200MB
    }
});


const storageInvoice = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/invoice/');
    },
    filename: (req, file, cb) => {
        // cb(null, Date.now() + '-' + file.originalname);

        // MVP1 Ventures
        cb(null, file.originalname);
    },
});

export const invoiceUpload = multer({
    storage: storageInvoice,
    limits: {
        fileSize: 200 * 1024 * 1024 // 200MB
    }
});


// MVP1 Ventures
const storageJobsheet = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/jobsheet/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});

export const jobsheetUpload = multer({
    storage: storageJobsheet,
    limits: {
        fileSize: 200 * 1024 * 1024 // 200MB
    }
});










// const multer = require('multer');

// const storage_product = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, "public/profile/");
//     },
//     filename: function (req, file, cb) {
//         cb(null, file.fieldname + Date.now() + '.jpg')
//     }
// });
// exports.upload = multer({ storage: storage_product });
