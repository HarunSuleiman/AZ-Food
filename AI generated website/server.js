const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Add this near the top with your other app.use statements
app.use(express.json()); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the static HTML files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Centralized State (Temporary Memory - resets if server restarts)
let activeOrders = [];
let completedOrders = [];
let orderIdCounter = 101;




// Temporary User Memory (Default Admin Account)
let users = [
    { username: 'admin', password: 'password123', role: 'admin' }
];

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        res.json({ success: true, role: user.role });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

// Admin API: Get all users
app.get('/api/users', (req, res) => {
    res.json(users);
});

// Admin API: Create a new user
app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    users.push({ username, password, role });
    res.json({ success: true, message: "User added" });
});
// WebSocket Connection Logic
io.on("connection", (socket) => {
  console.log(`New device connected: ${socket.id}`);

  // Immediately send the current state to the new connection
  socket.emit("sync-orders", { activeOrders, completedOrders });

  // Listen for new orders from the waitress
  socket.on("send-order", (cartItems) => {
    const newOrder = {
      id: orderIdCounter++,
      items: cartItems,
      timestamp: new Date().toLocaleTimeString(),
    };
    activeOrders.push(newOrder);

    // Broadcast the updated state to ALL connected devices instantly
    io.emit("sync-orders", { activeOrders, completedOrders });
  });

  // Listen for the kitchen completing an order
  socket.on("serve-order", (orderId) => {
    const orderIndex = activeOrders.findIndex((o) => o.id === orderId);
    if (orderIndex > -1) {
      const finishedOrder = activeOrders.splice(orderIndex, 1)[0];
      completedOrders.push(finishedOrder);

      io.emit("sync-orders", { activeOrders, completedOrders });
    }
  });

  // Listen for the kitchen clearing the daily log
  socket.on("clear-log", () => {
    completedOrders = [];
    io.emit("sync-orders", { activeOrders, completedOrders });
  });

  socket.on("disconnect", () => {
    console.log(`Device disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Waitress View: http://localhost:${PORT}/waitress.html`);
  console.log(`Kitchen View:  http://localhost:${PORT}/kitchen.html`);
});
