// import Joi from 'joi';
// import { mysqlQuery } from '../utils/mysqlDb.js';
// import { createErrorResponse, createSuccessResponse } from '../utils/responseUtil.js';

// // ✅ Warranty Status Helper
// function getWarrantyStatus(warrantyEndDate) {
//   if (!warrantyEndDate) return null;
//   const today = new Date();
//   const endDate = new Date(warrantyEndDate);
//   const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

//   if (diffDays < 0)   return { status: "EXPIRED",       daysRemaining: 0 };
//   if (diffDays <= 30) return { status: "EXPIRING_SOON", daysRemaining: diffDays };
//   return               { status: "ACTIVE",              daysRemaining: diffDays };
// }

// // ✅ Format BoatPart response
// function formatBoatPart(row) {
//   const warranty = getWarrantyStatus(row.warrantyEndDate);
//   return {
//     id:                 row.id,
//     boatId:             row.boatId,
//     partId:             row.partId,
//     // Part details
//     part_name:          row.part_name,
//     part_number:        row.part_number,
//     manufacturer:       row.manufacturer,
//     serial_number:      row.serial_number,
//     original_cost:      row.original_cost,
//     boat_owner_cost:    row.boat_owner_cost,
//     // Boat details
//     boat_name:          row.boat_name,
//     boat_rego:          row.boat_rego,
//     // BoatPart specific
//     installedDate:      row.installedDate,
//     warrantyStartDate:  row.warrantyStartDate,
//     warrantyEndDate:    row.warrantyEndDate,
//     status:             warranty?.status || row.status,
//     notes:              row.notes,
//     createdAt:          row.createdAt,
//     // Warranty calculation
//     warranty,
//   };
// }

// function calculateWarrantyEndDate(startDate, duration, type) {
//   if (!startDate || !duration || !type) return null;

//   const date = new Date(startDate);

//   switch (type) {
//     case "DAYS":
//       date.setDate(date.getDate() + parseInt(duration));
//       break;
//     case "MONTHS":
//       date.setMonth(date.getMonth() + parseInt(duration));
//       break;
//     case "YEARS":
//       date.setFullYear(date.getFullYear() + parseInt(duration));
//       break;
//     default:
//       return null;
//   }

//   return date;
// }

// // ✅ Install Part on Boat
//   export async function installPartOnBoat(req, res) {
//     try {
//       const {
//         boatId,
//         partId,
//         installedDate,
//         warrantyStartDate,  
//         notes,
//       } = req.body;

//       const schema = Joi.object({
//         boatId:            Joi.number().integer().required(),
//         partId:            Joi.number().integer().required(),
//         installedDate:     Joi.date().optional(),
//         warrantyStartDate: Joi.date().optional(), 
//         notes:             Joi.string().optional().allow(""),
//       });

//       const { error } = schema.validate(req.body);
//       if (error) {
//         return createErrorResponse(res, 400, error.details[0].message);
//       }
//       const boatRows = await mysqlQuery(
//         "SELECT id FROM `boat` WHERE id = ? LIMIT 1",
//         [parseInt(boatId)]
//       );
//       if (!boatRows[0]) {
//         return createErrorResponse(res, 404, "Boat not found");
//       }
//       const partRows = await mysqlQuery(
//         "SELECT * FROM `PartInventory` WHERE id = ? AND userId = ? LIMIT 1",
//         [partId, req.user.id]
//       );
//       if (!partRows[0]) {
//         return createErrorResponse(res, 404, "Part not found");
//       }

//       const part = partRows[0];
//       const warrantyEndDate = calculateWarrantyEndDate(
//         warrantyStartDate,
//         part.warranty_duration,
//         part.warranty_type
//       );

//       const warrantyInfo = getWarrantyStatus(warrantyEndDate);
//       const status = warrantyInfo?.status || "ACTIVE";

//       const result = await mysqlQuery(
//         `INSERT INTO \`BoatPart\`
//           (boatId, partId, installedDate, warrantyStartDate, warrantyEndDate, status, notes, createdAt, updatedAt)
//         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//         [
//           parseInt(boatId),
//           parseInt(partId),
//           installedDate     ? new Date(installedDate)     : null,
//           warrantyStartDate ? new Date(warrantyStartDate) : null,
//           warrantyEndDate   ? warrantyEndDate             : null,  
//           status,
//           notes || null,
//         ]
//       );

//       const rows = await mysqlQuery(
//         `SELECT bp.*,
//                 p.name AS part_name, p.part_number, p.manufacturer, p.serial_number,
//                 p.original_cost, p.boat_owner_cost,
//                 p.warranty_duration, p.warranty_type,
//                 b.name AS boat_name, b.rego AS boat_rego
//         FROM \`BoatPart\` bp
//         INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//         INNER JOIN \`boat\` b ON b.id = bp.boatId
//         WHERE bp.id = ? LIMIT 1`,
//         [result.insertId]
//       );

//       return createSuccessResponse(res, 201, true, "Part installed on boat successfully", formatBoatPart(rows[0]));

//     } catch (error) {
//       console.log(error);
//       return createErrorResponse(res, 500, "Internal server error");
//     }
//   }

// // ✅ Get All Parts of a Boat
// export async function getBoatParts(req, res) {
//   try {
//     const boatId = parseInt(req.params.boatId);

//     if (!boatId || Number.isNaN(boatId)) {
//       return createErrorResponse(res, 400, "Valid boat id is required");
//     }

//     const boatRows = await mysqlQuery(
//       "SELECT id, name, rego FROM `boat` WHERE id = ? LIMIT 1",
//       [boatId]
//     );
//     if (!boatRows[0]) {
//       return createErrorResponse(res, 404, "Boat not found");
//     }

//     const rows = await mysqlQuery(
//       `SELECT bp.*,
//               p.name AS part_name, p.part_number, p.manufacturer, p.serial_number,
//               p.original_cost, p.boat_owner_cost,
//               b.name AS boat_name, b.rego AS boat_rego
//        FROM \`BoatPart\` bp
//        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//        INNER JOIN \`boat\` b ON b.id = bp.boatId
//        WHERE bp.boatId = ?
//        ORDER BY bp.id DESC`,
//       [boatId]
//     );

//     const parts = rows.map(formatBoatPart);

//     // Warranty summary
//     const summary = {
//       total:         parts.length,
//       active:        parts.filter(p => p.status === "ACTIVE").length,
//       expiring_soon: parts.filter(p => p.status === "EXPIRING_SOON").length,
//       expired:       parts.filter(p => p.status === "EXPIRED").length,
//     };

//     return createSuccessResponse(res, 200, true, "Boat parts fetched successfully", {
//       boat_id:   boatId,
//       boat_name: boatRows[0].name,
//       boat_rego: boatRows[0].rego,
//       summary,
//       parts,
//     });

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, "Internal server error");
//   }
// }

// // ✅ Get Single BoatPart by ID
// export async function getBoatPartById(req, res) {
//   try {
//     const id = parseInt(req.params.id);

//     const rows = await mysqlQuery(
//       `SELECT bp.*,
//               p.name AS part_name, p.part_number, p.manufacturer, p.serial_number,
//               p.original_cost, p.boat_owner_cost,
//               b.name AS boat_name, b.rego AS boat_rego
//        FROM \`BoatPart\` bp
//        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//        INNER JOIN \`boat\` b ON b.id = bp.boatId
//        WHERE bp.id = ? AND p.userId = ?
//        LIMIT 1`,
//       [id, req.user.id]
//     );

//     if (!rows[0]) {
//       return createErrorResponse(res, 404, "Boat part not found");
//     }

//     return createSuccessResponse(res, 200, true, "Boat part fetched successfully", formatBoatPart(rows[0]));

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, "Internal server error");
//   }
// }

// // ✅ Update BoatPart
// // export async function updateBoatPart(req, res) {
// //   try {
// //     const id = parseInt(req.params.id);

// //     const existingRows = await mysqlQuery(
// //       `SELECT bp.* FROM \`BoatPart\` bp
// //        INNER JOIN \`boat\` b ON b.id = bp.boatId
// //        WHERE bp.id = ? AND b.userId = ? LIMIT 1`,
// //       [id, req.user.id]
// //     );

// //     if (!existingRows[0]) {
// //       return createErrorResponse(res, 404, "Boat part not found");
// //     }

// //     const existing = existingRows[0];

// //     const {
// //       installedDate,
// //       warrantyStartDate,
// //       warrantyEndDate,
// //       notes,
// //     } = req.body;

// //     const newWarrantyEndDate = warrantyEndDate
// //       ? new Date(warrantyEndDate)
// //       : existing.warrantyEndDate;

// //     const warrantyInfo = getWarrantyStatus(newWarrantyEndDate);
// //     const status = warrantyInfo?.status || existing.status;

// //     await mysqlQuery(
// //       `UPDATE \`BoatPart\`
// //        SET installedDate = ?, warrantyStartDate = ?, warrantyEndDate = ?,
// //            status = ?, notes = ?, updatedAt = NOW()
// //        WHERE id = ?`,
// //       [
// //         installedDate     ? new Date(installedDate)     : existing.installedDate,
// //         warrantyStartDate ? new Date(warrantyStartDate) : existing.warrantyStartDate,
// //         newWarrantyEndDate,
// //         status,
// //         notes ?? existing.notes,
// //         id,
// //       ]
// //     );

// //     const updatedRows = await mysqlQuery(
// //       `SELECT bp.*,
// //               p.name AS part_name, p.part_number, p.manufacturer, p.serial_number,
// //               p.original_cost, p.boat_owner_cost,
// //               b.name AS boat_name, b.rego AS boat_rego
// //        FROM \`BoatPart\` bp
// //        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
// //        INNER JOIN \`boat\` b ON b.id = bp.boatId
// //        WHERE bp.id = ? LIMIT 1`,
// //       [id]
// //     );

// //     return createSuccessResponse(res, 200, true, "Boat part updated successfully", formatBoatPart(updatedRows[0]));

// //   } catch (error) {
// //     console.log(error);
// //     return createErrorResponse(res, 500, "Internal server error");
// //   }
// // }
// export async function updateBoatPart(req, res) {
//   try {
//     const id = parseInt(req.params.id);

//     const existingRows = await mysqlQuery(
//       `SELECT bp.*, p.warranty_duration, p.warranty_type
//        FROM \`BoatPart\` bp
//        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//        INNER JOIN \`boat\` b ON b.id = bp.boatId
//        WHERE bp.id = ? AND p.userId = ? LIMIT 1`,
//       [id, req.user.id]
//     );

//     if (!existingRows[0]) {
//       return createErrorResponse(res, 404, "Boat part not found");
//     }

//     const existing = existingRows[0];

//     const { installedDate, warrantyStartDate, warrantyEndDate, notes } = req.body;

//     const newWarrantyStartDate = warrantyStartDate
//       ? new Date(warrantyStartDate)
//       : existing.warrantyStartDate;

//     let newWarrantyEndDate = existing.warrantyEndDate;
//     if (warrantyEndDate) {
//       newWarrantyEndDate = new Date(warrantyEndDate);
//     } else if (warrantyStartDate) {
//       newWarrantyEndDate = calculateWarrantyEndDate(
//         warrantyStartDate,
//         existing.warranty_duration,
//         existing.warranty_type
//       );
//     }

//     const warrantyInfo = getWarrantyStatus(newWarrantyEndDate);
//     const status = warrantyInfo?.status || existing.status;

//     await mysqlQuery(
//       `UPDATE \`BoatPart\`
//        SET installedDate = ?, warrantyStartDate = ?, warrantyEndDate = ?,
//            status = ?, notes = ?, updatedAt = NOW()
//        WHERE id = ?`,
//       [
//         installedDate        ? new Date(installedDate) : existing.installedDate,
//         newWarrantyStartDate,
//         newWarrantyEndDate,
//         status,
//         notes ?? existing.notes,
//         id,
//       ]
//     );

//     const updatedRows = await mysqlQuery(
//       `SELECT bp.*,
//               p.name AS part_name, p.part_number, p.manufacturer, p.serial_number,
//               p.original_cost, p.boat_owner_cost,
//               p.warranty_duration, p.warranty_type,
//               b.name AS boat_name, b.rego AS boat_rego
//        FROM \`BoatPart\` bp
//        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//        INNER JOIN \`boat\` b ON b.id = bp.boatId
//        WHERE bp.id = ? LIMIT 1`,
//       [id]
//     );

//     return createSuccessResponse(res, 200, true, "Boat part updated successfully", formatBoatPart(updatedRows[0]));

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, "Internal server error");
//   }
// }

// // ✅ Remove Part from Boat
// export async function removeBoatPart(req, res) {
//   try {
//     const id = parseInt(req.params.id);

//     const rows = await mysqlQuery(
//       `SELECT bp.id FROM \`BoatPart\` bp
//        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//        WHERE bp.id = ? AND p.userId = ? LIMIT 1`,
//       [id, req.user.id]
//     );

//     if (!rows[0]) {
//       return createErrorResponse(res, 404, "Boat part not found");
//     }

//     await mysqlQuery("DELETE FROM `BoatPart` WHERE id = ?", [id]);

//     return createSuccessResponse(res, 200, true, "Part removed from boat successfully");

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, "Internal server error");
//   }
// }

// // ✅ Warranty Dashboard — expiring/expired parts across all boats
// export async function getWarrantyDashboard(req, res) {
//   try {
//     const rows = await mysqlQuery(
//       `SELECT bp.*,
//               p.name AS part_name, p.part_number, p.manufacturer, p.serial_number,
//               p.original_cost, p.boat_owner_cost,
//               b.name AS boat_name, b.rego AS boat_rego
//        FROM \`BoatPart\` bp
//        INNER JOIN \`PartInventory\` p ON p.id = bp.partId
//        INNER JOIN \`boat\` b ON b.id = bp.boatId
//        WHERE p.userId = ?
//        ORDER BY bp.warrantyEndDate ASC`,
//       [req.user.id]
//     );

//     const parts = rows.map(formatBoatPart);

//     return createSuccessResponse(res, 200, true, "Warranty dashboard fetched successfully", {
//       summary: {
//         total:         parts.length,
//         active:        parts.filter(p => p.status === "ACTIVE").length,
//         expiring_soon: parts.filter(p => p.status === "EXPIRING_SOON").length,
//         expired:       parts.filter(p => p.status === "EXPIRED").length,
//       },
//       expiring_soon: parts.filter(p => p.status === "EXPIRING_SOON"),
//       expired:       parts.filter(p => p.status === "EXPIRED"),
//       active:        parts.filter(p => p.status === "ACTIVE"),
//     });

//   } catch (error) {
//     console.log(error);
//     return createErrorResponse(res, 500, "Internal server error");
//   }
// }
