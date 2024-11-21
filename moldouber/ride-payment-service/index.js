const express = require('express');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const async = require('async'); // For concurrency control
const axios = require('axios'); // For HTTP requests
const WebSocket = require('ws'); // Add WebSocket library
const client = require('prom-client');
const app = express();

app.use(express.json());

const register = new client.Registry();

// Collect default metrics
client.collectDefaultMetrics({ register });

// Define custom metrics
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
const mongoClient = new MongoClient('mongodb://mongo:27017', { useUnifiedTopology: true });

let paymentsCollection;

mongoClient.connect().then((client) => {
  const db = client.db('ridepaymentdb');
  paymentsCollection = db.collection('payments');
  console.log('Connected to MongoDB');
});

// Task queue with concurrency limit of 6
const taskQueue = async.queue(async (task) => {
  return task();
}, 6);  // Limit concurrency to 6

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

// PayRide endpoint
app.post('/pay_ride', (req, res) => {
  taskQueue.push(async () => {
    const { rideId, amount, userId } = req.body;

    if (!rideId || !amount || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store payment info in MongoDB
    await paymentsCollection.insertOne({ rideId, amount, userId, status: 'orderPaid' });

    res.json({ rideId, status: 'orderPaid' });
  });
});

// ProcessPayment endpoint
app.post('/process_payment', (req, res) => {
  taskQueue.push(async () => {
    const { rideId } = req.body;

    if (!rideId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payment = await paymentsCollection.findOne({ rideId });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ rideId, status: payment.status });
  });
});

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});


// Express app for status
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'Ride Payment Service is running' });
});

// Start the HTTP server
app.listen(SERVICE_PORT, () => {
  console.log(`Ride Payment Service is running on port ${SERVICE_PORT}`);
});

// WebSocket client to connect to user-location-service via Nginx
const ws = new WebSocket('ws://nginx/ws/');

ws.on('open', () => {
  console.log('Connected to user-location-service via WebSocket');
});

ws.on('message', async (data) => {
  const message = JSON.parse(data);
  console.log('Received message via WebSocket:', message);

  if (message.event === 'finish_order') {
    const { rideId, realPrice, userId } = message.data;

    // Automatically process payment
    await paymentsCollection.insertOne({ rideId, amount: realPrice, userId, status: 'orderPaid' });
    console.log(`Processed payment for rideId ${rideId}`);
  }
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
