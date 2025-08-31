// src/api/setup-data.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");
const mysql = require("mysql2/promise");

const router = express.Router();

// Configure file upload
const uploadFolder = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// --- MySQL connection pool ---
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

// --- Test route ---
router.get("/", (req, res) => {
  res.send("Hello Admin! API works (Node.js)");
});

// --- Upload & Preview Excel ---
router.post("/upload_forecasted", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    // Required columns
    const requiredColumns = ["PROGRAM", "DEPARTMENT", "YEAR", "ENROLLED_COUNT"];
    const missing = requiredColumns.filter((col) => !Object.keys(data[0] || {}).includes(col));

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Excel missing required columns: ${missing.join(", ")}`,
      });
    }

    return res.json({ output: data });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: `Failed to process Excel file: ${err.message}` });
  }
});

// --- Save to Database ---
router.post("/save_forecasted", async (req, res) => {
  try {
    const data = req.body.data || [];
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "No data provided" });
    }

    const conn = await pool.getConnection();

    try {
      // Clear existing rows
      await conn.query("TRUNCATE TABLE tbl_forecasted_enrolled");

      const query = `
        INSERT INTO tbl_forecasted_enrolled 
        (fe_program_abbr, fe_department, fe_year_level, fe_enrolled_count) 
        VALUES (?, ?, ?, ?)
      `;

      for (const row of data) {
        const { PROGRAM, DEPARTMENT, YEAR, ENROLLED_COUNT } = row;
        await conn.query(query, [
          PROGRAM,
          DEPARTMENT,
          parseInt(YEAR, 10),
          parseInt(ENROLLED_COUNT, 10),
        ]);
      }

      conn.release();
      return res.json({ success: true });
    } catch (dbErr) {
      conn.release();
      console.error("Database save error:", dbErr);
      return res.status(500).json({ success: false, error: dbErr.message });
    }
  } catch (err) {
    console.error("Save error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
