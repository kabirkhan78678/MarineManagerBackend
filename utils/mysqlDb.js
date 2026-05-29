import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

let pool;

function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(databaseUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace("/", ""),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

export function getMysqlPool() {
  if (!pool) {
    pool = mysql.createPool(getDatabaseConfig());
  }

  return pool;
}

export async function mysqlQuery(sql, params = []) {
  const [rows] = await getMysqlPool().execute(sql, params);
  return rows;
}

export async function mysqlTransaction(callback) {
  const connection = await getMysqlPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
