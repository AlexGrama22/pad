const express = require('express');
const { Pool } = require('pg'); 
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');  
const async = require('async'); 
const axios = require('axios');
const WebSocket = require('ws');
const app = express();
const rooms = {};

app.use(express.json());

// PostgreSQL client setup
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: 'postgres', // Container name for PostgreSQL
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
});

// Redis client setup
const redisClient = redis.createClient({
  url: 'redis://redis:6379'
});
redisClient.connect(); // Connect Redis client

// Task queue with concurrency limit of 2
const taskQueue = async.queue(async (task) => {
  return task();
}, 2);  // Limit concurrency to 2

// Mock function to calculate estimated price
function calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude) {
  return Math.random() * 100;  // Random estimated price
}

// Service Discovery Configuration
const SERVICE_DISCOVERY_URL = process.env.SERVICE_DISCOVERY_URL || 'http://service-discovery:8500';
const SERVICE_NAME = process.env.SERVICE_NAME || 'user-location-service';
const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS || 'user-location-service';
const SERVICE_PORT = process.env.SERVICE_PORT || 5001;

// Function to register the service
async function registerService() {
    try {
        await axios.post(`${SERVICE_DISCOVERY_URL}/register`, {
            service_name: SERVICE_NAME,
            service_address: 'nginx',  // Register Nginx as the service address
            service_port: '80'          // Nginx listens on port 80 inside the container
        });
        console.log(`${SERVICE_NAME} registered with Service Discovery`);
    } catch (error) {
        console.error('Error registering service:', error.message);
    }
}

// Function to deregister the service
async function deregisterService() {
    try {
        await axios.post(`${SERVICE_DISCOVERY_URL}/deregister`, {
            service_name: SERVICE_NAME,
            service_address: 'nginx',
            service_port: '80'
        });
        console.log(`${SERVICE_NAME} deregistered from Service Discovery`);
    } catch (error) {
        console.error('Error deregistering service:', error.message);
    }
}

// Register service on startup
registerService();

// Handle graceful shutdown
process.on('SIGINT', deregisterService);
process.on('SIGTERM', deregisterService);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ port: 8021 });
console.log('WebSocket server is running on port 8021');

let wsClients = [];

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('A WebSocket client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const { type, orderId, userId, driverId, content } = message;

      switch (type) {
        case 'join_room':
          if (!rooms[orderId]) {
            rooms[orderId] = []; // Create a new room if it doesn't exist
          }
          rooms[orderId].push(ws); // Add client to the room
          console.log(`Client joined room: ${orderId}`);
          break;

        case 'send_message':
          if (rooms[orderId]) {
            rooms[orderId].forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ userId, driverId, content }));
              }
            });
          }
          break;

        default:
          console.error('Unknown message type:', type);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('A WebSocket client disconnected');
    // Remove the disconnected client from all rooms
    for (const [roomId, clients] of Object.entries(rooms)) {
      rooms[roomId] = clients.filter((client) => client !== ws);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId]; // Remove empty rooms
      }
    }
  });
});

// Broadcast function to send messages to all connected clients
function broadcast(message) {
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastToRoom(orderId, message) {
  if (rooms[orderId]) {
    rooms[orderId].forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

// MakeOrder endpoint with Redis caching
app.post('/make_order', (req, res) => {
  taskQueue.push(async () => {
    const { userId, startLongitude, startLatitude, endLongitude, endLatitude } = req.body;

    if (!userId || !startLongitude || !startLatitude || !endLongitude || !endLatitude) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orderId = uuidv4();  // Generate unique orderId
    const estimatedPrice = calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude);
    broadcastToRoom(orderId, { type: 'join_room', orderId, userId });

    // Store the order in Redis cache
    await redisClient.set(orderId, JSON.stringify({
      userId,
      startLongitude,
      startLatitude,
      endLongitude,
      endLatitude,
      estimatedPrice
    }), {
      EX: 3600 // Set expiration for 1 hour
    });

    res.json({ orderId, estimatedPrice });
  });
});

// AcceptOrder endpoint with PostgreSQL insert
app.post('/accept_order', (req, res) => {
  taskQueue.push(async () => {
    const { orderId, driverId } = req.body;

    if (!orderId || !driverId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Retrieve the order details from Redis cache
    const orderData = await redisClient.get(orderId);
    broadcastToRoom(orderId, { type: 'join_room', orderId, driverId });

    if (!orderData) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = JSON.parse(orderData);
    const rideId = uuidv4();  // Generate unique rideId

    // Store ride info in PostgreSQL
    try {
      await pool.query(
        'INSERT INTO rides (userId, rideId, driverId) VALUES ($1, $2, $3)',
        [order.userId, rideId, driverId]
      );
    } catch (err) {
      console.error('Error saving to PostgreSQL:', err);
      return res.status(500).json({ error: 'Error saving ride data' });
    }

    // Respond with the stored values
    res.json({
      rideId,
      userId: order.userId,
      startLongitude: order.startLongitude,
      startLatitude: order.startLatitude,
      endLongitude: order.endLongitude,
      endLatitude: order.endLatitude,
      estimatedPrice: order.estimatedPrice
    });
  });
});

// FinishOrder endpoint
app.post('/finish_order', (req, res) => {
  taskQueue.push(async () => {
    const { rideId, realPrice } = req.body;

    if (!rideId || !realPrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const paymentStatus = 'notPaid';

    // Retrieve userId from PostgreSQL
    let userId;
    try {
      const result = await pool.query('SELECT userId FROM rides WHERE rideId = $1', [rideId]);
      if (result.rows.length > 0) {
        userId = result.rows[0].userid;
      } else {
        return res.status(404).json({ error: 'Ride not found' });
      }
    } catch (err) {
      console.error('Error querying PostgreSQL:', err);
      return res.status(500).json({ error: 'Error retrieving ride data' });
    }

    // Notify ride-payment-service via WebSocket
    const message = {
      event: 'finish_order',
      data: {
        rideId,
        realPrice,
        userId
      }
    };
    broadcast(message);
    console.log('Sent finish_order event via WebSocket:', message);

    res.json({ paymentStatus, userId });
  });
});

// PaymentCheck endpoint
app.post('/payment_check', (req, res) => {
  taskQueue.push(async () => {
    const { rideId } = req.body;

    if (!rideId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Retrieve userId from PostgreSQL
    let userId;
    try {
      const result = await pool.query('SELECT userId FROM rides WHERE rideId = $1', [rideId]);
      if (result.rows.length > 0) {
        userId = result.rows[0].userid;
      } else {
        return res.status(404).json({ error: 'Ride not found' });
      }
    } catch (err) {
      console.error('Error querying PostgreSQL:', err);
      return res.status(500).json({ error: 'Error retrieving ride data' });
    }

    // Discover Ride Payment Service via Nginx
    const ridePaymentUrl = `http://nginx/ride-payment/process_payment`;

    try {
      const paymentResponse = await axios.post(ridePaymentUrl, { rideId }, { timeout: 10000 });
      res.json({ status: paymentResponse.data.status, userId });
    } catch (err) {
      console.error('Error communicating with Ride Payment Service:', err);
      res.status(503).json({ error: 'Error fetching payment status' });
    }
  });
});

// Express app for status
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'User Location Service is running' });
});

// Start the HTTP server
app.listen(SERVICE_PORT, () => {
  console.log(`User Location Service is running on port ${SERVICE_PORT}`);
});
