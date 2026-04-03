require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || "global_care",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  connectionLimit: 20,
  multipleStatements: true,
});

const query = async (text, params) => {
  let mysqlText = text.replace(/\$\d+/g, "?").replace(/ILIKE/gi, "LIKE");
  const isReturning = text.match(/RETURNING\s+(.*)/i);
  if (isReturning) {
    mysqlText = mysqlText.replace(/RETURNING\s+.*$/i, "");
  }

  try {
    const [rows, fields] = await pool.query(mysqlText, params);
    
    // If SELECT
    if (Array.isArray(rows)) {
      return { rows, rowCount: rows.length };
    }

    // If INSERT / UPDATE / DELETE
    let returningRows = [];
    if (isReturning && rows.affectedRows > 0) {
      if (text.match(/^INSERT/i)) {
        // If it was an insert and we know the insertId
        if (rows.insertId) {
          const tableNameMatch = text.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
          if (tableNameMatch) {
            const table = tableNameMatch[1];
            const [selRows] = await pool.query(`SELECT ${isReturning[1]} FROM ${table} WHERE id = ?`, [rows.insertId]);
            returningRows = selRows;
          }
        }
      } else if (text.match(/^UPDATE/i)) {
        // Extract the ID parameter index from original query, e.g. "WHERE id = $1" or "WHERE id = $2"
        const idMatch = text.match(/WHERE.*?id\s*=\s*\$(\d+)/i);
        if (idMatch) {
          const paramIndex = parseInt(idMatch[1], 10) - 1;
          const idVal = params[paramIndex];
          const tableNameMatch = text.match(/UPDATE\s+([a-zA-Z0-9_]+)/i);
          if (idVal && tableNameMatch) {
            const table = tableNameMatch[1];
            const [selRows] = await pool.query(`SELECT ${isReturning[1]} FROM ${table} WHERE id = ?`, [idVal]);
            returningRows = selRows;
          }
        }
      } else if (text.match(/^DELETE/i)) {
         // for DELETE RETURNING id
         const idMatch = text.match(/WHERE.*?id\s*=\s*\$(\d+)/i);
         if (idMatch) {
            const paramIndex = parseInt(idMatch[1], 10) - 1;
            const idVal = params[paramIndex];
            returningRows = [{ id: idVal }];
         }
      }
    }
    
    return { 
      rows: returningRows, 
      rowCount: rows.affectedRows || 0,
      insertId: rows.insertId
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("SQL Error:", mysqlText, params, err);
    }
    throw err;
  }
};

const getClient = async () => {
  const connection = await pool.getConnection();
  return { query, release: () => connection.release() };
};

module.exports = { pool, query, getClient };
