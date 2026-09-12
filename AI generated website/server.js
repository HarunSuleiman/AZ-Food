const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// 1. MySQL Cloud Database Connection
// ==========================================
const connectionString =
  "mysql://VVMohrySZbMoH4K.root:UFGpOvH05GOB7sa3@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test";

const pool = mysql.createPool({
  uri: connectionString,
  ssl: {
    rejectUnauthorized: true, // Required for secure cloud databases
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test the database connection when the server starts
pool
  .getConnection()
  .then((conn) => {
    console.log("Database connected successfully!");
    conn.release();
  })
  .catch((err) =>
    console.error(
      "Database connection failed. Check your connection string:",
      err,
    ),
  );

// ==========================================
// 2. User & Authentication APIs (MySQL)
// ==========================================

// Login API
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ? AND password = ?",
      [username, password],
    );

    if (rows.length > 0) {
      res.json({ success: true, role: rows[0].role });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Admin API: Get all users
app.get("/api/users", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT username, role FROM users");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Admin API: Create a new user
app.post("/api/users", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, password, role],
    );
    res.json({ success: true, message: "User added permanently!" });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      success: false,
      message: "Failed to add user (Username might already exist)",
    });
  }
});

// Admin API: Delete a user
app.delete("/api/users/:username", async (req, res) => {
  try {
    const username = req.params.username;

    // Security check: Prevent deleting the master admin
    if (username === "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Cannot delete master admin" });
    }

    await pool.query("DELETE FROM users WHERE username = ?", [username]);
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});

// ==========================================
// 3. Order Management (In-Memory for Speed)
// ==========================================
let activeOrders = [];
let completedOrders = [];
let orderIdCounter = 101;

// Admin API: Get completed orders for CSV Export
app.get("/api/orders/history", (req, res) => {
  res.json(completedOrders);
});

// Admin API: Clear the completed orders log
app.post("/api/clear-log", (req, res) => {
  completedOrders = [];
  io.emit("sync-orders", { activeOrders, completedOrders });
  res.json({ success: true });
});

// ==========================================
// 4. Real-Time WebSockets (Socket.io)
// ==========================================
io.on("connection", (socket) => {
  console.log(`New device connected: ${socket.id}`);

  // Send current state to newly connected device
  socket.emit("sync-orders", { activeOrders, completedOrders });

  // Waitress sends a new order
  socket.on("send-order", (orderData) => {
    const newOrder = {
      id: orderIdCounter++,
      table: orderData.table,
      items: orderData.items,
      timestamp: new Date().toLocaleTimeString(),
    };
    activeOrders.push(newOrder);

    // Broadcast updated lists to everyone
    io.emit("sync-orders", { activeOrders, completedOrders });
  });

  // Kitchen serves an order
  socket.on("serve-order", (orderId) => {
    const orderIndex = activeOrders.findIndex((o) => o.id === orderId);
    if (orderIndex > -1) {
      const finishedOrder = activeOrders.splice(orderIndex, 1)[0];
      completedOrders.push(finishedOrder);

      // Broadcast updated lists to everyone
      io.emit("sync-orders", { activeOrders, completedOrders });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Device disconnected: ${socket.id}`);
  });
});

// ==========================================
// 5. Start Server
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
