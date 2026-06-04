import Joi from "joi";
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
import { mysqlQuery, mysqlTransaction } from "../utils/mysqlDb.js";

let tableReadyPromise;

function parseParts(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
}

function normalizeRequestedParts(parts) {
  return parseParts(parts)
    .map((part) => {
      const partName = part.partName || part.name || part.materialName;
      const unitsUsed = Number(part.unitsUsed ?? part.quantity ?? 0);

      if (!partName || Number.isNaN(unitsUsed) || unitsUsed <= 0) {
        return null;
      }

      return {
        partName,
        unitsUsed,
        note: part.note || null,
      };
    })
    .filter(Boolean);
}

function formatPartInventoryResponse(part) {
  const stockQuantity = Number(part.stock_quantity ?? 0);
  const lowStockAlert = Number(part.low_stock_alert ?? 10);

  return {
    id: part.id,
    userId: part.userId,
    name: part.name ?? null,
    original_cost: part.original_cost,
    boat_owner_cost: part.boat_owner_cost,
    stock_quantity: part.stock_quantity,
    low_stock_alert: part.low_stock_alert,
    low_stock: stockQuantity <= lowStockAlert,
    warranty_duration: part.warranty_duration ?? null,
    warranty_type: part.warranty_type ?? null,
    part_number: part.part_number ?? null,
    manufacturer: part.manufacturer ?? null,
    serial_number: part.serial_number ?? null,
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
  };
}

export async function ensureExtraPartRequestTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = mysqlQuery(`
      CREATE TABLE IF NOT EXISTS ExtraPartRequest (
        id INT NOT NULL AUTO_INCREMENT,
        taskId INT NOT NULL,
        jobServiceSheetId INT NULL,
        userId INT NOT NULL,
        requesterType ENUM('SUPPLIER', 'STAFF') NOT NULL,
        supplierId INT NULL,
        staffId INT NULL,
        partName VARCHAR(255) NOT NULL,
        unitsUsed DOUBLE NOT NULL,
        note LONGTEXT NULL,
        status ENUM('PENDING', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        partInventoryId INT NULL,
        materialId INT NULL,
        fulfilledMessage LONGTEXT NULL,
        requesterRead TINYINT(1) NOT NULL DEFAULT 0,
        fulfilledAt DATETIME NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_extra_part_request_user (userId, status),
        INDEX idx_extra_part_request_supplier (supplierId, status),
        INDEX idx_extra_part_request_staff (staffId, status),
        INDEX idx_extra_part_request_task (taskId),
        CONSTRAINT fk_extra_part_request_task FOREIGN KEY (taskId) REFERENCES \`Task\`(id) ON DELETE CASCADE,
        CONSTRAINT fk_extra_part_request_sheet FOREIGN KEY (jobServiceSheetId) REFERENCES \`JobServiceSheet\`(id) ON DELETE CASCADE,
        CONSTRAINT fk_extra_part_request_user FOREIGN KEY (userId) REFERENCES \`User\`(id) ON DELETE CASCADE,
        CONSTRAINT fk_extra_part_request_supplier FOREIGN KEY (supplierId) REFERENCES \`Supplier\`(id) ON DELETE CASCADE,
        CONSTRAINT fk_extra_part_request_staff FOREIGN KEY (staffId) REFERENCES \`Staff_Member\`(id) ON DELETE CASCADE,
        CONSTRAINT fk_extra_part_request_part FOREIGN KEY (partInventoryId) REFERENCES \`PartInventory\`(id) ON DELETE SET NULL,
        CONSTRAINT fk_extra_part_request_material FOREIGN KEY (materialId) REFERENCES \`Material\`(id) ON DELETE SET NULL
      )
    `).then(() =>
      mysqlQuery(
        "ALTER TABLE `ExtraPartRequest` MODIFY `jobServiceSheetId` INT NULL"
      ).catch((error) => {
        if (!["ER_FK_COLUMN_CANNOT_CHANGE", "ER_CANT_DROP_FIELD_OR_KEY"].includes(error.code)) {
          throw error;
        }
      })
    );
  }

  return tableReadyPromise;
}

async function createUserNotification(connection, params) {
  const data =
    typeof params.data === "string"
      ? params.data
      : JSON.stringify(params.data || {});

  await connection.execute(
    `INSERT INTO \`Notification\`
      (byStaffId, toUserId, taskId, isRead, content, type, data, createdAt, updatedAt)
      VALUES (?, ?, ?, 0, ?, ?, ?, NOW(), NOW())`,
    [
      params.byStaffId || null,
      params.toUserId,
      params.taskId,
      params.content,
      params.type,
      data,
    ]
  );
}

async function findTaskForRequester(connection, { taskId, requesterType, requesterId }) {
  const ownerColumn = requesterType === "SUPPLIER" ? "supplierId" : "assignStaffId";
  const [tasks] = await connection.execute(
    `SELECT t.*, u.fcm_token, u.company_name AS userCompanyName
     FROM \`Task\` t
     INNER JOIN \`User\` u ON u.id = t.userId
     WHERE t.id = ? AND t.${ownerColumn} = ?
     LIMIT 1`,
    [taskId, requesterId]
  );

  return tasks[0] || null;
}

async function findJobSheetForRequester(connection, params) {
  const ownerColumn = params.requesterType === "SUPPLIER" ? "supplierId" : "staffId";
  const ownerId = params.requesterType === "SUPPLIER" ? params.supplierId : params.staffId;
  const values = [params.taskId, ownerId];
  let idClause = "";

  if (params.jobServiceSheetId) {
    idClause = "AND id = ?";
    values.push(params.jobServiceSheetId);
  }

  const [sheets] = await connection.execute(
    `SELECT *
     FROM \`JobServiceSheet\`
     WHERE taskId = ? AND ${ownerColumn} = ? ${idClause}
     ORDER BY id DESC
     LIMIT 1`,
    values
  );

  return sheets[0] || null;
}

export async function createExtraPartRequestsForJobSheet(params) {
  const requestedParts = normalizeRequestedParts(params.parts);

  if (!requestedParts.length) {
    return [];
  }

  await ensureExtraPartRequestTable();

  return mysqlTransaction(async (connection) => {
    const requestIds = [];

    for (const part of requestedParts) {
      const [result] = await connection.execute(
        `INSERT INTO \`ExtraPartRequest\`
          (taskId, jobServiceSheetId, userId, requesterType, supplierId, staffId, partName, unitsUsed, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.taskId,
          params.jobServiceSheetId,
          params.userId,
          params.requesterType,
          params.supplierId || null,
          params.staffId || null,
          part.partName,
          part.unitsUsed,
          part.note || null,
        ]
      );

      requestIds.push(result.insertId);
    }

    await createUserNotification(connection, {
      toUserId: params.userId,
      byStaffId: params.staffId || null,
      taskId: params.taskId,
      type: "extra_part_request",
      content: `${params.requesterName} requested extra parts for CDS Job Sheet`,
      data: {
        requestIds,
        requestedParts,
        jobServiceSheetId: params.jobServiceSheetId || null,
        supplierId: params.supplierId || null,
        staffId: params.staffId || null,
        requesterType: params.requesterType,
      },
    });

    return requestIds.map((id, index) => ({
      id,
      ...requestedParts[index],
      status: "PENDING",
    }));
  });
}

async function createRequesterExtraPartRequest(req, res, requesterType) {
  const requesterId = req.user.id;
  const { taskId, jobServiceSheetId, parts } = req.body;

  const requestedParts = normalizeRequestedParts(parts || req.body.extraPartsUsed);
  const schema = Joi.object({
    taskId: Joi.number().integer().required(),
    jobServiceSheetId: Joi.number().integer().optional(),
  }).unknown(true);

  const { error } = schema.validate(req.body);

  if (error || requestedParts.length === 0) {
    return createErrorResponse(
      res,
      400,
      error?.details?.[0]?.message || "At least one valid requested part is required"
    );
  }

  try {
    await ensureExtraPartRequestTable();

    const result = await mysqlTransaction(async (connection) => {
      const task = await findTaskForRequester(connection, {
        taskId: Number(taskId),
        requesterType,
        requesterId,
      });

      if (!task) {
        return { notFound: "Task not found" };
      }

      const jobSheet = jobServiceSheetId
        ? await findJobSheetForRequester(connection, {
          taskId: Number(taskId),
          jobServiceSheetId: Number(jobServiceSheetId),
          requesterType,
          supplierId: requesterType === "SUPPLIER" ? requesterId : null,
          staffId: requesterType === "STAFF" ? requesterId : null,
        })
        : null;

      if (jobServiceSheetId && !jobSheet) {
        return { notFound: "CDS job sheet not found for this task" };
      }

      const requesterName =
        requesterType === "SUPPLIER"
          ? req.user.company_name || req.user.email
          : req.user.full_name || req.user.email;

      const created = await createExtraPartRequestsForJobSheet({
        taskId: task.id,
        jobServiceSheetId: jobSheet?.id || null,
        userId: task.userId,
        requesterType,
        supplierId: requesterType === "SUPPLIER" ? requesterId : null,
        staffId: requesterType === "STAFF" ? requesterId : null,
        requesterName,
        parts: requestedParts,
      });

      return { created };
    });

    if (result.notFound) {
      return createErrorResponse(res, 404, result.notFound);
    }

    return createSuccessResponse(
      res,
      201,
      true,
      "Extra part request sent successfully",
      result.created
    );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, "Internal server error");
  }
}

export async function createSupplierExtraPartRequest(req, res) {
  return createRequesterExtraPartRequest(req, res, "SUPPLIER");
}

export async function createStaffExtraPartRequest(req, res) {
  return createRequesterExtraPartRequest(req, res, "STAFF");
}

export async function getUserExtraPartRequests(req, res) {
  try {
    await ensureExtraPartRequestTable();
    const validStatuses = ["PENDING", "FULFILLED"];
    const requestedStatus = req.query.status ? String(req.query.status).toUpperCase() : "PENDING";
    const status = validStatuses.includes(requestedStatus) ? requestedStatus : "PENDING";
    const params = [req.user.id];
    const statusClause = "AND e.status = ?";
    params.push(status);

    const rows = await mysqlQuery(
      `SELECT e.*, t.jobNumber, js.documentLink,
        s.company_name AS supplierCompanyName,
        sm.full_name AS staffName
       FROM \`ExtraPartRequest\` e
       INNER JOIN \`Task\` t ON t.id = e.taskId
       LEFT JOIN \`JobServiceSheet\` js ON js.id = e.jobServiceSheetId
       LEFT JOIN \`Supplier\` s ON s.id = e.supplierId
       LEFT JOIN \`Staff_Member\` sm ON sm.id = e.staffId
       WHERE e.userId = ? ${statusClause}
       ORDER BY e.id DESC`,
      params
    );

    return createSuccessResponse(res, 200, true, "Extra part requests fetched successfully", rows);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, "Internal server error");
  }
}

async function getRequesterExtraPartRequests(req, res, requesterType) {
  try {
    await ensureExtraPartRequestTable();

    const idColumn = requesterType === "SUPPLIER" ? "supplierId" : "staffId";
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const params = [req.user.id];
    let statusClause = "";

    if (status) {
      statusClause = "AND e.status = ?";
      params.push(status);
    }

    const rows = await mysqlQuery(
      `SELECT e.*, p.name AS addedPartName, m.pricePerUnit, m.totalPrice
       FROM \`ExtraPartRequest\` e
       LEFT JOIN \`PartInventory\` p ON p.id = e.partInventoryId
       LEFT JOIN \`Material\` m ON m.id = e.materialId
       WHERE e.${idColumn} = ? ${statusClause}
       ORDER BY e.id DESC`,
      params
    );

    return createSuccessResponse(res, 200, true, "Extra part requests fetched successfully", rows);
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, "Internal server error");
  }
}

export async function getSupplierExtraPartRequests(req, res) {
  return getRequesterExtraPartRequests(req, res, "SUPPLIER");
}

export async function getStaffExtraPartRequests(req, res) {
  return getRequesterExtraPartRequests(req, res, "STAFF");
}

export async function getExtraPartRequestsForTask({
  taskId,
  requesterType,
  requesterId,
}) {
  await ensureExtraPartRequestTable();

  const idColumn =
    requesterType === "SUPPLIER"
      ? "supplierId"
      : "staffId";

  return mysqlQuery(
    `SELECT e.id,
            e.taskId,
            e.jobServiceSheetId,
            e.requesterType,
            e.partName,
            e.unitsUsed,
            e.note,
            e.status,
            e.partInventoryId,
            e.materialId,
            e.fulfilledMessage,
            e.fulfilledAt,
            e.createdAt,
            e.updatedAt,
            p.id AS addedPartId,
            p.userId AS addedPartUserId,
            p.name AS addedPartName,
            p.original_cost AS addedPartOriginalCost,
            p.boat_owner_cost AS addedPartBoatOwnerCost,
            p.stock_quantity AS addedPartStockQuantity,
            p.low_stock_alert AS addedPartLowStockAlert,
            p.createdAt AS addedPartCreatedAt,
            p.updatedAt AS addedPartUpdatedAt,
            m.id AS attachedMaterialId,
            m.materialName AS attachedMaterialName,
            m.unitsUsed AS attachedMaterialUnitsUsed,
            m.pricePerUnit AS attachedMaterialPricePerUnit,
            m.totalPrice AS attachedMaterialTotalPrice
     FROM \`ExtraPartRequest\` e
     LEFT JOIN \`PartInventory\` p ON p.id = e.partInventoryId
     LEFT JOIN \`Material\` m ON m.id = e.materialId
     WHERE e.taskId = ? AND e.${idColumn} = ?
     ORDER BY e.id DESC`,
    [Number(taskId), Number(requesterId)]
  ).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      jobServiceSheetId: row.jobServiceSheetId,
      requesterType: row.requesterType,
      partName: row.partName,
      unitsUsed: row.unitsUsed,
      note: row.note,
      status: row.status,
      partInventoryId: row.partInventoryId,
      materialId: row.materialId,
      fulfilledMessage: row.fulfilledMessage,
      fulfilledAt: row.fulfilledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      requestedPart: {
        name: row.partName,
        unitsUsed: row.unitsUsed,
        note: row.note,
      },
      addedPart: row.addedPartId
        ? {
          id: row.addedPartId,
          userId: row.addedPartUserId,
          name: row.addedPartName,
          original_cost: row.addedPartOriginalCost,
          boat_owner_cost: row.addedPartBoatOwnerCost,
          stock_quantity: row.addedPartStockQuantity,
          low_stock_alert: row.addedPartLowStockAlert,
          low_stock:
            Number(row.addedPartStockQuantity || 0) <=
            Number(row.addedPartLowStockAlert || 0),
          createdAt: row.addedPartCreatedAt,
          updatedAt: row.addedPartUpdatedAt,
        }
        : null,
      attachedMaterial: row.attachedMaterialId
        ? {
          id: row.attachedMaterialId,
          materialName: row.attachedMaterialName,
          unitsUsed: row.attachedMaterialUnitsUsed,
          pricePerUnit: row.attachedMaterialPricePerUnit,
          totalPrice: row.attachedMaterialTotalPrice,
        }
        : null,
    }))
  );
}

export async function getAvailablePartsForTaskUser(userId) {
  await ensureExtraPartRequestTable();

  const rows = await mysqlQuery(
    `SELECT p.id,
            p.userId,
            p.name,
            p.original_cost,
            p.boat_owner_cost,
            p.stock_quantity,
            p.low_stock_alert,
            p.createdAt,
            p.updatedAt,
            MAX(e.id) AS extraPartRequestId,
            MAX(e.status) AS extraPartRequestStatus
     FROM \`PartInventory\` p
     LEFT JOIN \`ExtraPartRequest\` e
       ON e.partInventoryId = p.id
      AND e.status = 'FULFILLED'
     WHERE p.userId = ?
     GROUP BY p.id
     ORDER BY p.id DESC`,
    [Number(userId)]
  );

  return rows.map((part) => ({
    id: part.id,
    userId: part.userId,
    name: part.name,
    original_cost: part.original_cost,
    boat_owner_cost: part.boat_owner_cost,
    stock_quantity: part.stock_quantity,
    low_stock_alert: part.low_stock_alert,
    low_stock:
      Number(part.stock_quantity || 0) <=
      Number(part.low_stock_alert || 0),
    extraPartRequestId: part.extraPartRequestId || null,
    extraPartRequestStatus: part.extraPartRequestStatus || null,
    source: part.extraPartRequestId ? "REQUEST_FULFILLED" : "USER_INVENTORY",
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
  }));
}

export async function fulfillExtraPartRequest(req, res) {
  const {
    requestId,
    original_cost,
    boat_owner_cost,
    stock_quantity,
    low_stock_alert,
    pricePerUnit,
    totalPrice,
  } = req.body;

  // const schema = Joi.object({
  //   requestId: Joi.number().integer().required(),
  //   original_cost: Joi.number().required(),
  //   boat_owner_cost: Joi.number().required(),
  //   stock_quantity: Joi.number().required(),
  //   low_stock_alert: Joi.number().optional(),
  //   pricePerUnit: Joi.number().optional(),
  //   totalPrice: Joi.number().optional(),
  // });
  const schema = Joi.object({
    requestId: Joi.number().integer().required(),
    original_cost: Joi.number().required(),
    boat_owner_cost: Joi.number().required(),
    stock_quantity: Joi.number().required(),
    low_stock_alert: Joi.number().optional(),

    pricePerUnit: Joi.number().optional(),
    totalPrice: Joi.number().optional(),

    warranty_duration: Joi.number().optional(),
    warranty_type: Joi.string()
      .valid("DAYS", "MONTHS", "YEARS")
      .optional(),

    part_number: Joi.string().optional().allow(""),
    manufacturer: Joi.string().optional().allow(""),
    serial_number: Joi.string().optional().allow("")
  });
  const { error } = schema.validate(req.body);

  if (error) {
    return createErrorResponse(res, 400, error.details[0].message);
  }

  try {
    await ensureExtraPartRequestTable();

    const result = await mysqlTransaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT *
         FROM \`ExtraPartRequest\`
         WHERE id = ? AND userId = ?
         LIMIT 1`,
        [Number(requestId), req.user.id]
      );

      const request = requests[0];

      if (!request) {
        return { notFound: "Extra part request not found" };
      }

      if (request.status !== "PENDING") {
        return { conflict: "Extra part request is already fulfilled" };
      }

      const partName = request.partName;
      const partCost = Number(pricePerUnit ?? boat_owner_cost);
      const materialTotal = Number(totalPrice ?? request.unitsUsed * partCost);

      const [partResult] = await connection.execute(
        `INSERT INTO PartInventory
  (
    name,
    original_cost,
    boat_owner_cost,
    stock_quantity,
    low_stock_alert,
    warranty_duration,
    warranty_type,
    part_number,
    manufacturer,
    serial_number,
    userId,
    createdAt,
    updatedAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          partName,
          Number(original_cost),
          Number(boat_owner_cost),
          Number(stock_quantity),
          Number(low_stock_alert ?? 10),
          req.body.warranty_duration ?? null,
          req.body.warranty_type ?? null,
          req.body.part_number ?? null,
          req.body.manufacturer ?? null,
          req.body.serial_number ?? null,

          req.user.id,
        ]
      );

      let materialId = null;

      if (request.jobServiceSheetId) {
        const [existingMaterials] = await connection.execute(
          `SELECT id
           FROM \`Material\`
           WHERE jobServiceSheetId = ?
             AND materialName = ?
             AND (pricePerUnit IS NULL OR pricePerUnit = 0)
             AND totalPrice = 0
           ORDER BY id ASC
           LIMIT 1`,
          [request.jobServiceSheetId, request.partName]
        );

        materialId = existingMaterials[0]?.id || null;

        if (materialId) {
          await connection.execute(
            `UPDATE \`Material\`
             SET materialName = ?, unitsUsed = ?, pricePerUnit = ?, totalPrice = ?, updatedAt = NOW()
             WHERE id = ?`,
            [partName, request.unitsUsed, partCost, materialTotal, materialId]
          );
        } else {
          const [materialResult] = await connection.execute(
            `INSERT INTO \`Material\`
              (materialName, unitsUsed, pricePerUnit, totalPrice, jobServiceSheetId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [partName, request.unitsUsed, partCost, materialTotal, request.jobServiceSheetId]
          );

          materialId = materialResult.insertId;
        }
      }

      const fulfilledMessage = request.jobServiceSheetId
        ? `${partName} was added by ${req.user.company_name || req.user.email} and attached to the CDS Job Sheet`
        : `${partName} was added by ${req.user.company_name || req.user.email} and is now available for the CDS Job Sheet`;

      await connection.execute(
        `UPDATE \`ExtraPartRequest\`
         SET status = 'FULFILLED',
             partInventoryId = ?,
             materialId = ?,
             fulfilledMessage = ?,
             requesterRead = 0,
             fulfilledAt = NOW(),
             updatedAt = NOW()
         WHERE id = ?`,
        [partResult.insertId, materialId, fulfilledMessage, request.id]
      );

      const [createdParts] = await connection.execute(
        `SELECT *
         FROM \`PartInventory\`
         WHERE id = ? AND userId = ?
         LIMIT 1`,
        [partResult.insertId, req.user.id]
      );
      const addedPart = formatPartInventoryResponse(createdParts[0]);

      return {
        requestId: request.id,
        partInventoryId: partResult.insertId,
        materialId,
        jobServiceSheetId: request.jobServiceSheetId,
        message: fulfilledMessage,
        stock_quantity: addedPart.stock_quantity,
        low_stock_alert: addedPart.low_stock_alert,
        low_stock: addedPart.low_stock,
        addedPart,
      };
    });

    if (result.notFound) {
      return createErrorResponse(res, 404, result.notFound);
    }

    if (result.conflict) {
      return createErrorResponse(res, 409, result.conflict);
    }

    return createSuccessResponse(
      res,
      200,
      true,
      "Requested part added to CDS Job Sheet successfully",
      result
    );
  } catch (error) {
    console.error(error);
    return createErrorResponse(res, 500, "Internal server error");
  }
}
