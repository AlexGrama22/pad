// ride-payment-service/index.js

const express = require('express');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const async = require('async'); // For concurrency control
const axios = require('axios'); // For HTTP requests
const client = require('prom-client');
const redis = require('redis'); // Ensure redis is imported
const app = express();

app.use(express.json());

// Collect default metrics
client.collectDefaultMetrics();

// Define custom metrics
const register = new client.Registry();
const paymentCount = new client.Counter({
  name: 'ride_payment_total',
  help: 'Total number of ride payments processed',
  labelNames: ['status']
});
const paymentDuration = new client.Histogram({
  name: 'ride_payment_duration_seconds',
  help: 'Duration of ride payment processing in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Register metrics
register.registerMetric(paymentCount);
register.registerMetric(paymentDuration);

// Middleware to measure payment processing time and count
app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const end = paymentDuration.startTimer();
  res.on('finish', () => {
    const status = res.statusCode >= 400 ? 'failure' : 'success';
    paymentCount.labels(status).inc();
    end();
  });
  next();
});

// MongoDB client setup
const mongoClient = new MongoClient('mongodb://mongo:27017');

let paymentsCollection;

mongoClient.connect()
  .then((client) => {
    const db = client.db('ridepaymentdb');
    paymentsCollection = db.collection('payments');
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit if MongoDB connection fails
  });

// Task queue with concurrency limit of 6
const taskQueue = async.queue(async (task, callback) => {
  try {
    await task();
    callback();
  } catch (err) {
    callback(err);
  }
}, 6);

// Define a mapping from namespace to Redis URL using internal port 6379
const namespaceToRedisUrl = {
  'user': 'redis://redis1:6379',
  'location': 'redis://redis2:6379',
  'ride': 'redis://redis3:6379',
  'default': 'redis://redis1:6379' // Default mapping
};

// Initialize Redis clients with optional password
const redisClients = {
  'user': redis.createClient({ url: namespaceToRedisUrl['user'], password: process.env.REDIS_PASSWORD || undefined }),
  'location': redis.createClient({ url: namespaceToRedisUrl['location'], password: process.env.REDIS_PASSWORD || undefined }),
  'ride': redis.createClient({ url: namespaceToRedisUrl['ride'], password: process.env.REDIS_PASSWORD || undefined })
};

// Connect all Redis clients at startup
for (const [namespace, client] of Object.entries(redisClients)) {
  client.connect()
    .then(() => {
      console.log(`Connected to Redis instance for namespace '${namespace}' at ${namespaceToRedisUrl[namespace]}`);
    })
    .catch(err => {
      console.error(`Redis connection error for namespace '${namespace}' at ${namespaceToRedisUrl[namespace]}:`, err);
      process.exit(1); // Exit if any Redis connection fails
    });
}

// Function to get Redis client based on key's namespace
function getRedisClient(key) {
  let namespace;
  
  if (key.startsWith('user:')) {
    namespace = 'user';
  } else if (key.startsWith('location:')) {
    namespace = 'location';
  } else if (key.startsWith('ride:')) {
    namespace = 'ride';
  } else {
    namespace = 'default';
  }

  const client = redisClients[namespace];
  
  if (!client) {
    throw new Error(`No Redis client found for namespace '${namespace}'`);
  }

  return client;
}

// Service Discovery Configuration
const SERVICE_DISCOVERY_URL = process.env.SERVICE_DISCOVERY_URL || 'http://service-discovery:8500';
const SERVICE_NAME = process.env.SERVICE_NAME || 'ride-payment-service';
const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS || 'ride-payment-service';
const SERVICE_PORT = process.env.SERVICE_PORT || 5002;

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
    // Optionally implement retry logic here
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
    // Optionally implement retry logic here
  }
}

// Register service on startup
registerService();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await deregisterService();
  for (const client of Object.values(redisClients)) {
    await client.quit();
  }
  process.exit();
});
process.on('SIGTERM', async () => {
  await deregisterService();
  for (const client of Object.values(redisClients)) {
    await client.quit();
  }
  process.exit();
});

// PayRide endpoint
app.post('/pay_ride', async (req, res) => {
  const { rideId, amount, userId } = req.body;

  if (!rideId || !amount || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Define namespaced key
  const rideStatusKey = `ride:${rideId}:status`;

  // Get the appropriate Redis client based on namespace
  const rideStatusClient = getRedisClient(rideStatusKey);

  try {
    // Insert payment record with status 'orderPaid'
    await paymentsCollection.insertOne({ rideId, amount, userId, status: 'orderPaid' });

    // Cache the payment status in Redis
    await rideStatusClient.set(rideStatusKey, JSON.stringify({ userId, amount, status: 'orderPaid' }), {
      EX: 3600 // Set expiration for 1 hour
    });

    console.log(`Payment processed for rideId ${rideId}: paymentStatus: Paid`);

    res.json({ rideId, status: 'orderPaid' });
  } catch (err) {
    console.error('Error processing payment:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ProcessPayment endpoint
app.post('/process_payment', async (req, res) => {
  const { rideId, amount, userId } = req.body;

  if (!rideId || !amount || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Define namespaced key
  const rideStatusKey = `ride:${rideId}:status`;

  // Get the appropriate Redis client based on namespace
  const rideStatusClient = getRedisClient(rideStatusKey);

  try {
    // Insert payment record with status 'orderPaid' and current timestamp
    await paymentsCollection.insertOne({
      rideId,
      amount,
      userId,
      status: 'orderPaid',
      timestamp: new Date()
    });

    // Cache the payment status in Redis
    await rideStatusClient.set(rideStatusKey, JSON.stringify({ userId, amount, status: 'orderPaid' }), {
      EX: 3600 // Set expiration for 1 hour
    });

    console.log(`Payment processed for rideId ${rideId}: paymentStatus: Paid`);

    res.json({ paymentStatus: 'Paid' });
  } catch (err) {
    console.error('Error processing payment:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to retrieve payment status
app.post('/process_payment_status', async (req, res) => {
  const { rideId } = req.body;

  if (!rideId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Define namespaced key
  const rideStatusKey = `ride:${rideId}:status`;

  // Get the appropriate Redis client based on namespace
  const rideStatusClient = getRedisClient(rideStatusKey);

  try {
    const payment = await paymentsCollection.findOne({ rideId });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ rideId, status: payment.status });
  } catch (err) {
    console.error('Error retrieving payment status:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Status endpoint
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'Ride Payment Service is running' });
});

// Start the HTTP server
app.listen(SERVICE_PORT, () => {
  console.log(`Ride Payment Service is running on port ${SERVICE_PORT}`);
});
