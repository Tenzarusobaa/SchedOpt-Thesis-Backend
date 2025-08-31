//server/api/main.js
const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config(); // load .env
// Routes
const tableRoutes = require("./table.js");

const app = express();
const PORT = process.env.PORT || 5000; // Use Railway's dynamic port

app.use(cors());
app.use(bodyParser.json());

// MySQL connection using Railway ENV vars
const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("OK Database.");
});

// Use routes
app.use("/api", tableRoutes);

// Schema endpoint
app.get("/api/schema/:tableName", (req, res) => {
  const { tableName } = req.params;
  
  // Validate table name to prevent SQL injection
  const validTables = [
    'tbl_forecasted_enrolled',
    'tbl_program_department',
    'tbl_prospectus_list',
    'tbl_room_data',
    'tbl_time_slot',
    'tbl_day_slot',
    'tbl_course_section',
    'tbl_program_sections',
    'tbl_program_tracks',
    'tbl_initial_assignments',
    'tbl_final_assignment'
  ];
  
  if (!validTables.includes(tableName)) {
    return res.status(400).json({ error: "Invalid table name" });
  }
  
  const query = `SELECT * FROM ${tableName}`;
  db.query(query, (err, results) => {
    if (err) {
      console.error(`Error fetching from ${tableName}:`, err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Map database column names to display names
    const columnMapping = {
      'tbl_forecasted_enrolled': {
        'fe_program_abbr': 'Program Abbreviation',
        'fe_department': 'Department',
        'fe_year_level': 'Year Level',
        'fe_enrolled_count': 'Enrolled Count'
      },
      'tbl_program_department': {
        'pd_program_abbr': 'Program Abbreviation',
        'pd_program_name': 'Program Name',
        'pd_department': 'Department',
        'pd_priority_index': 'Priority Index'
      },
      'tbl_prospectus_list': {
        'pl_id': 'ID',
        'pl_program': 'Program',
        'pl_department': 'Department',
        'pl_year': 'Year',
        'pl_course_code': 'Course Code',
        'pl_course_title': 'Course Title',
        'pl_units': 'Units',
        'pl_semester': 'Semester',
        'pl_type': 'Type'
      },
      'tbl_room_data': {
        'rd_room_code': 'Room Code',
        'rd_building': 'Building',
        'rd_capacity': 'Capacity',
        'rd_size': 'Size',
        'rd_type': 'Type',
        'rd_function': 'Function',
        'rd_department_owner': 'Department Owner',
        'rd_program_owner': 'Program Owner'
      },
      'tbl_time_slot': {
        'ts_key': 'Key',
        'ts_start_time': 'Start Time',
        'ts_end_time': 'End Time',
        'ts_duration': 'Duration',
        'ts_final': 'Time Slot'
      },
      'tbl_day_slot': {
        'ds_key': 'Key',
        'ds_abbr': 'Abbreviation',
        'ds_day': 'Day',
        'ds_day_type': 'Day Type'
      }
    };
    
    // If we have a mapping for this table, use it
    if (columnMapping[tableName]) {
      const mappedResults = results.map(row => {
        const newRow = {};
        for (const [dbColumn, displayName] of Object.entries(columnMapping[tableName])) {
          newRow[displayName] = row[dbColumn];
        }
        return newRow;
      });
      res.json(mappedResults);
    } else {
      // Fallback to original column names if no mapping exists
      res.json(results);
    }
  });
});

// Rooms endpoint
app.get("/api/rooms/:buildingName", (req, res) => {
  const { buildingName } = req.params;

  console.log("Requested building:", buildingName);

  const query = `SELECT * FROM tbl_room_data WHERE rd_building = ?`;
  db.query(query, [buildingName], (err, results) => {
    if (err) {
      console.error("Error fetching rooms:", err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log("Rooms fetched:", results.length);
    res.json(results);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});