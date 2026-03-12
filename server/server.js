require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.log("Database connection failed:", err);
  } else {
    console.log("MySQL Connected");
  }
});

// test route
app.get("/", (req, res) => {
  res.send("KaliSOS backend running");
});

// SOS API
app.post("/sos", (req, res) => {

  const { user_name, phone, latitude, longitude } = req.body;

  const sql =
    "INSERT INTO sos_alerts (user_name, phone, latitude, longitude) VALUES (?, ?, ?, ?)";

  db.query(sql, [user_name, phone, latitude, longitude], (err, result) => {

    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json({
      message: "SOS alert stored successfully"
    });

  });

});

// NEW API FOR DASHBOARD
app.get("/alerts", (req, res) => {

  const sql = "SELECT * FROM sos_alerts ORDER BY created_at DESC";

  db.query(sql, (err, result) => {

    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(result);

  });

});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});

// DELETE alert (mark as handled)
app.delete("/alerts/:id", (req, res) => {

  const { id } = req.params;

  const sql = "DELETE FROM sos_alerts WHERE id = ?";

  db.query(sql, [id], (err, result) => {

    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json({ message: "Alert handled and removed" });

  });

});