const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let users = [{ username: "admin", password: "password123", role: "admin" }];

let activeOrders = [];
let completedOrders = [];
let orderIdCounter = 101;

// Login & User APIs
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(
    (u) => u.username === username && u.password === password,
  );
  if (user) res.json({ success: true, role: user.role });
  else res.status(401).json({ success: false, message: "Invalid credentials" });
});

app.get("/api/users", (req, res) => res.json(users));

app.post("/api/users", (req, res) => {
  const { username, password, role } = req.body;
  users.push({ username, password, role });
  res.json({ success: true, message: "User added" });
});

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

// WebSocket Connection Logic
io.on("connection", (socket) => {
  console.log(`New device connected: ${socket.id}`);
  socket.emit("sync-orders", { activeOrders, completedOrders });

  // UPDATED: Now receives an object with both items and the table number
  socket.on("send-order", (orderData) => {
    const newOrder = {
      id: orderIdCounter++,
      table: orderData.table,
      items: orderData.items,
      timestamp: new Date().toLocaleTimeString(),
    };
    activeOrders.push(newOrder);
    io.emit("sync-orders", { activeOrders, completedOrders });
  });

  socket.on("serve-order", (orderId) => {
    const orderIndex = activeOrders.findIndex((o) => o.id === orderId);
    if (orderIndex > -1) {
      const finishedOrder = activeOrders.splice(orderIndex, 1)[0];
      completedOrders.push(finishedOrder);
      io.emit("sync-orders", { activeOrders, completedOrders });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Device disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
