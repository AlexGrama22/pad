const express = require('express');
const { Pool } = require('pg'); 
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');  
const async = require('async'); 
const axios = require('axios');
const WebSocket = require('ws');
const app = express();
const rooms = {};
const client = require('prom-client');

app.use(express.json());

// PostgreSQL client setup
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: 'postgres', // Container name for PostgreSQL
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
});


// Redis primary and replica setup
const redisPrimaries = [
  new Redis({ host: 'redis-shard1-primary', port: 6379 }),
  new Redis({ host: 'redis-shard2-primary', port: 6379 }),
  new Redis({ host: 'redis-shard3-primary', port: 6379 }),
];

const redisReplicas = [
  new Redis({ host: 'redis-shard1-replica', port: 6379 }),
  new Redis({ host: 'redis-shard2-replica', port: 6379 }),
  new Redis({ host: 'redis-shard3-replica', port: 6379 }),
];

const register = new client.Registry();
client.collectDefaultMetrics({ register }); // Collect default metrics


// Custom Prometheus Metrics
const requestCount = new client.Counter({
  name: 'user_location_service_requests_total',
  help: 'Total number of requests to the user location service',
  labelNames: ['endpoint', 'method', 'status'],
});
const requestDuration = new client.Histogram({
  name: 'user_location_service_request_duration_seconds',
  help: 'Duration of user location service requests in seconds',
  labelNames: ['endpoint', 'method'],
  buckets: [0.1, 0.5, 1, 2, 5], // Example buckets for request duration
});
const cacheHits = new client.Counter({
  name: 'user_location_service_cache_hits',
  help: 'Number of cache hits',
  labelNames: ['shard'],
});
const cacheMisses = new client.Counter({
  name: 'user_location_service_cache_misses',
  help: 'Number of cache misses',
});

// Register custom metrics
register.registerMetric(requestCount);
register.registerMetric(requestDuration);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);


app.use((req, res, next) => {
  if (req.path === '/metrics') return next();

  const start = Date.now();
  const endpoint = req.path;
  const method = req.method;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    requestCount.labels(endpoint, method, res.statusCode.toString()).inc();
    requestDuration.labels(endpoint, method).observe(duration);
  });

  next();
});

// Helper function to record cache hits/misses
const recordCacheMetrics = (isHit, shardIndex) => {
  const shardLabel = `shard_${shardIndex + 1}`;
  if (isHit) {
    cacheHits.labels(shardLabel).inc();
  } else {
    cacheMisses.labels(shardLabel).inc();
  }
};


// redisShards.forEach((shard, index) => {
//   shard.on('connect', () => console.log(`Connected to Redis Shard ${index + 1}`));
//   shard.on('error', (err) => {
//     console.error(`Redis Shard ${index + 1} connection error:`, err);
//     setTimeout(() => shard.connect(), 5000); // Retry connection
//   });

//   shard.connect().catch((err) => console.error(`Failed to connect to Redis Shard ${index + 1}:`, err));
// });

const primaryHealth = new Map();
redisPrimaries.forEach((primary, index) => {
  primaryHealth.set(index, true);

  primary.on('connect', () => {
    console.log(`Primary Redis Shard ${index + 1} connected`);
    primaryHealth.set(index, true);
  });

  primary.on('error', (err) => {
    console.error(`Primary Redis Shard ${index + 1} error:`, err);
    primaryHealth.set(index, false); // Mark as unavailable
  });
});

redisReplicas.forEach((replica, index) => {
  replica.on('connect', () => console.log(`Replica Redis Shard ${index + 1} connected`));
  replica.on('error', (err) => console.error(`Replica Redis Shard ${index + 1} error:`, err));
});

// Helper function to get a healthy primary shard for writing
const getHealthyPrimary = () => {
  for (let [index, isHealthy] of primaryHealth.entries()) {
    if (isHealthy) {
      return redisPrimaries[index];
    }
  }
  throw new Error('No healthy primary Redis shards available');
};

const getShardIndex = (key) => key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % redisPrimaries.length;

// Cache data: Writes to a healthy primary
const cacheData = async (key, value) => {
  try {
    const shardIndex = getShardIndex(key); // Calculate shard index based on key hash
    const primaryShard = redisPrimaries[shardIndex]; // Get the primary shard for the calculated index

    // Check if the selected primary shard is healthy
    if (!primaryHealth.get(shardIndex)) {
      throw new Error(`Primary Redis Shard ${shardIndex + 1} is unavailable`);
    }

    await primaryShard.set(key, JSON.stringify(value), 'EX', 3600); // Set with 1-hour TTL
    console.log(`Key ${key} cached in Primary Shard ${shardIndex + 1}`);
  } catch (err) {
    console.error(`Error caching key ${key}:`, err);
  }
};

// Task queue with concurrency limit of 2
const taskQueue = async.queue(async (task) => {
  return task();
}, 2);  // Limit concurrency to 2


// Get data: Tries primary, falls back to replica
const getCachedData = async (key) => {
  const shardIndex = getShardIndex(key);
  const primary = redisPrimaries[shardIndex];
  const replica = redisReplicas[shardIndex];

  try {
    const data = await primary.get(key);
    if (data) {
      console.log(`Cache hit for key ${key} on Primary Shard ${shardIndex + 1}`);
      return JSON.parse(data);
    }
  } catch (primaryErr) {
    console.warn(`Primary shard ${shardIndex + 1} unavailable for key ${key}:`, primaryErr);
  }

  try {
    const replicaData = await replica.get(key);
    if (replicaData) {
      console.log(`Cache hit for key ${key} on Replica Shard ${shardIndex + 1}`);
      return JSON.parse(replicaData);
    }
  } catch (replicaErr) {
    console.error(`Replica Shard ${shardIndex + 1} unavailable for key ${key}:`, replicaErr);
  }

  console.log(`Cache miss for key ${key}`);
  return null;
};

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
app.post('/make_order', async (req, res) => {
  const { userId, startLongitude, startLatitude, endLongitude, endLatitude } = req.body;

  if (!userId || !startLongitude || !startLatitude || !endLongitude || !endLatitude) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const orderId = uuidv4();
  const estimatedPrice = Math.random() * 100; // Mock price calculation
  const orderData = { userId, startLongitude, startLatitude, endLongitude, endLatitude, estimatedPrice };

  await cacheData(orderId, orderData);

  res.json({ orderId, estimatedPrice });
});

// AcceptOrder endpoint with fallback to slaves if masters are unavailable
app.post('/accept_order', async (req, res) => {
  const { orderId, driverId } = req.body;

  if (!orderId || !driverId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let orderData;

  // Helper function to check all masters or slaves for data
  const checkRedisInstances = async (instances, key) => {
    for (const [index, instance] of instances.entries()) {
      try {
        const data = await instance.get(key);
        if (data) {
          console.log(`Cache hit for key ${key} on Redis Instance ${index + 1}`);
          return JSON.parse(data);
        }
      } catch (err) {
        console.warn(`Redis Instance ${index + 1} unavailable or key not found:`, err);
      }
    }
    return null;
  };

  // Try to retrieve data from all running master instances
  orderData = await checkRedisInstances(redisPrimaries, orderId);

  // If not found in masters, check all slave instances
  if (!orderData) {
    console.warn(`Key ${orderId} not found in any master, checking slaves...`);
    orderData = await checkRedisInstances(redisReplicas, orderId);
  }

  // If still not found, return 404
  if (!orderData) {
    return res.status(404).json({ error: 'Order not found in Redis (Masters or Slaves)' });
  }

  const rideId = uuidv4(); // Unique ride ID

  // Save to PostgreSQL
  try {
    await pool.query('INSERT INTO rides (userId, rideId, driverId) VALUES ($1, $2, $3)', [
      orderData.userId,
      rideId,
      driverId,
    ]);
    console.log('Ride saved to PostgreSQL:', { userId: orderData.userId, rideId, driverId });
    res.json({ rideId, ...orderData });
  } catch (err) {
    console.error('Error saving ride data to PostgreSQL:', err);
    res.status(500).json({ error: 'Error saving ride data to PostgreSQL' });
  }
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

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});


// Express app for status
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'User Location Service is running' });
});

// Forward operation for saga
app.post('/saga/forward', async (req, res) => {
  const { transactionId, userId, location } = req.body;

  if (!transactionId || !userId || !location) {
      return res.status(400).json({ 
          status: 'failed', 
          reason: 'Missing required fields', 
          operation: 'forward' 
      });
  }

  try {
      await pool.query(
          'INSERT INTO locations (transaction_id, user_id, location) VALUES ($1, $2, $3)',
          [transactionId, userId, location]
      );
      res.status(200).json({ 
          status: 'success', 
          operation: 'forward', 
          message: `Forward operation completed for transaction ${transactionId}` 
      });
  } catch (err) {
      console.error('Error during forward action:', err.message);
      res.status(500).json({ 
          status: 'failed', 
          reason: err.message, 
          operation: 'forward' 
      });
  }
});

// Compensate operation for saga
app.post('/saga/compensate', async (req, res) => {
  const { transactionId, userId, location } = req.body;

  if (!transactionId || !userId || !location) {
      return res.status(400).json({ 
          status: 'failed', 
          reason: 'Missing required fields', 
          operation: 'compensate' 
      });
  }

  try {
      await pool.query('DELETE FROM locations WHERE user_id = $1 AND location = $2', [userId, location]);
      res.status(200).json({ 
          status: 'compensated', 
          operation: 'compensate', 
          message: `Compensate operation completed for transaction ${transactionId}` 
      });
  } catch (err) {
      console.error('Error during compensate action:', err.message);
      res.status(500).json({ 
          status: 'failed', 
          reason: err.message, 
          operation: 'compensate' 
      });
  }
});

// Start the HTTP server
app.listen(SERVICE_PORT, () => {
  console.log(`User Location Service is running on port ${SERVICE_PORT}`);
});
