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

  const checkSql =
  "SELECT id FROM sos_alerts WHERE phone=? AND status='active' LIMIT 1";

  db.query(checkSql,[phone],(err,result)=>{

    if(err){
      console.log(err);
      return res.status(500).json({message:"Database error"});
    }

    if(result.length > 0){

      // update existing alert location
      const updateSql =
      "UPDATE sos_alerts SET latitude=?, longitude=?, created_at=NOW() WHERE phone=? AND status='active'";

      db.query(updateSql,[latitude,longitude,phone],(err)=>{

        if(err){
          console.log(err);
          return res.status(500).json({message:"Update error"});
        }

        res.json({message:"Location updated"});

      });

    }else{

      // create new alert
      const insertSql =
      "INSERT INTO sos_alerts (user_name, phone, latitude, longitude) VALUES (?, ?, ?, ?)";

      db.query(insertSql,[user_name,phone,latitude,longitude],(err)=>{

        if(err){
          console.log(err);
          return res.status(500).json({message:"Insert error"});
        }

        res.json({message:"SOS alert created"});

      });

    }

  });

});

// NEW API FOR DASHBOARD
app.get("/alerts", (req, res) => {

  const sql = "SELECT * FROM sos_alerts WHERE status='active' ORDER BY created_at DESC";

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

  const sql = "UPDATE sos_alerts SET status='handled' WHERE id=?";

  db.query(sql, [id], (err, result) => {

    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json({ message: "Alert handled and removed" });

  });

});

app.get("/alert-status/:phone", (req, res) => {

  const phone = req.params.phone;

  const sql = "SELECT status FROM sos_alerts WHERE phone=? ORDER BY id DESC LIMIT 1";

  db.query(sql, [phone], (err, result) => {

    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.length === 0) {
      return res.json({ status: "active" });
    }

    res.json(result[0]);

  });

});