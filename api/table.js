// src/api/table.js
const express = require("express");
const mysql = require("mysql2");
const router = express.Router();

// MySQL connection
const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

router.get("/test123", (req, res) => {
  res.send("Testig testing.");
});

// Get timetable data with days where ds_day_type is 'Single'
router.get("/timetable", (req, res) => {
  const query = `
    SELECT ds_day 
    FROM tbl_day_slot 
    WHERE ds_day_type = 'Single'
    ORDER BY FIELD(ds_day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      res.status(500).json({ error: "Failed to fetch timetable data" });
      return;
    }
    
    // Extract just the day names from the results
    const days = results.map(row => row.ds_day);
    res.json(days);
  });
});

// Get time slots from tbl_time_slot ordered by ts_key
router.get("/timeslots", (req, res) => {
  const query = `
    SELECT ts_final 
    FROM tbl_time_slot 
    ORDER BY ts_key ASC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      res.status(500).json({ error: "Failed to fetch time slots" });
      return;
    }
    
    // Extract just the time slot strings from the results
    const timeSlots = results.map(row => row.ts_final);
    res.json(timeSlots);
  });
});

// Get final assignment data
router.get("/final-assignments", (req, res) => {
  const query = `
    SELECT 
      fa_course_section,
      fa_room_code,
      fa_final_timeslot,
      fa_day_abbr,
      fa_start_time,
      fa_end_time,
      fa_department,
      fa_program_section
    FROM tbl_final_assignment
    ORDER BY fa_start_time, fa_end_time
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      res.status(500).json({ error: "Failed to fetch final assignments" });
      return;
    }
    
    res.json(results);
  });
});

// Update assignment endpoint
router.post("/update", async (req, res) => {
  const { course_code_section, newDay, newTimeslot } = req.body;

  if (!course_code_section || !newDay || !newTimeslot) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // First get the current assignment details
    const getAssignmentQuery = `
      SELECT fa_room_code, fa_day_abbr, fa_start_time, fa_end_time 
      FROM tbl_final_assignment 
      WHERE fa_course_section = ?
    `;

    db.query(getAssignmentQuery, [course_code_section], (err, assignmentResult) => {
      if (err) {
        console.error("Error getting assignment:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (assignmentResult.length === 0) {
        return res.status(404).json({ error: "Course not found" });
      }

      const assignment = assignmentResult[0];
      const room = assignment.fa_room_code;

      // Define day relationships for conflict checking
      const dayRelationships = {
        'M': ['M', 'MTh'],
        'T': ['T', 'TF'],
        'W': ['W', 'WS'],
        'Th': ['Th', 'MTh'],
        'F': ['F', 'TF'],
        'S': ['S', 'WS'],
        'Su': ['Su'],
        'MTh': ['M', 'Th', 'MTh'],
        'TF': ['T', 'F', 'TF'],
        'WS': ['W', 'S', 'WS']
      };

      const conflictingDays = dayRelationships[newDay] || [newDay];
      const placeholders = conflictingDays.map(() => '?').join(',');

      // Check for conflicts in the target timeslot
      const conflictQuery = `
        SELECT fa_course_section, fa_room_code, fa_day_abbr, fa_final_timeslot
        FROM tbl_final_assignment
        WHERE fa_room_code = ?
          AND fa_day_abbr IN (${placeholders})
          AND fa_final_timeslot = ?
          AND fa_course_section != ?
      `;

      db.query(conflictQuery, [room, ...conflictingDays, newTimeslot, course_code_section], 
        (err, conflictResult) => {
          if (err) {
            console.error("Error checking for conflicts:", err);
            return res.status(500).json({ error: "Database conflict check failed" });
          }

          if (conflictResult.length > 0) {
            const conflictItem = conflictResult[0];
            return res.status(400).json({
              error: "Schedule conflict detected",
              conflict: {
                course_code_section: conflictItem.fa_course_section,
                room: conflictItem.fa_room_code,
                day: conflictItem.fa_day_abbr,
                timeslot: conflictItem.fa_final_timeslot
              }
            });
          }

          // Parse the new timeslot to get start and end times
          const [startTime, endTime] = newTimeslot.split(' - ');

          // Update the assignment
          const updateQuery = `
            UPDATE tbl_final_assignment 
            SET fa_day_abbr = ?, fa_final_timeslot = ?, fa_start_time = ?, fa_end_time = ?
            WHERE fa_course_section = ?
          `;

          db.query(updateQuery, [newDay, newTimeslot, startTime, endTime, course_code_section], 
            (err, result) => {
              if (err) {
                console.error("Error updating database:", err);
                return res.status(500).json({ error: "Database update failed" });
              }

              res.json({ success: true, message: "Schedule updated successfully" });
            }
          );
        }
      );
    });
  } catch (error) {
    console.error("Error in update endpoint:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get final assignments for a specific building
router.get("/final-assignments/:building", (req, res) => {
  const { building } = req.params;

  const query = `
    SELECT 
      fa_course_section,
      fa_room_code,
      fa_final_timeslot,
      fa_day_abbr,
      fa_start_time,
      fa_end_time,
      fa_department,
      fa_program_section
    FROM tbl_final_assignment fa
    JOIN tbl_room_data rd ON fa.fa_room_code = rd.rd_room_code
    WHERE rd.rd_building = ?
    ORDER BY fa_start_time, fa_end_time
  `;

  db.query(query, [building], (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Failed to fetch final assignments for building" });
    }
    res.json(results);
  });
});

// NEW: Get final assignment data for specific building and room
router.get("/final-assignments/:building/:room", (req, res) => {
  const { building, room } = req.params;

  const query = `
    SELECT 
      fa_course_section,
      fa_room_code,
      fa_final_timeslot,
      fa_day_abbr,
      fa_start_time,
      fa_end_time,
      fa_department,
      fa_program_section
    FROM tbl_final_assignment fa
    JOIN tbl_room_data rd ON fa.fa_room_code = rd.rd_room_code
    WHERE rd.rd_building = ? AND fa.fa_room_code = ?
    ORDER BY fa_start_time, fa_end_time
  `;

  db.query(query, [building, room], (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Failed to fetch final assignments for building and room" });
    }
    res.json(results);
  });
});

module.exports = router;