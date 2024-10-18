// user-location-service/index.js

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Pool } = require('pg'); // PostgreSQL client
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');  // For generating IDs
const express = require('express');
const async = require('async'); // Import async for concurrency control
const axios = require('axios'); // Add axios for HTTP requests
const WebSocket = require('ws'); // Add WebSocket library
const app = express();

const PROTO_PATH = '/usr/src/proto/user_location.proto';
const RIDE_PAYMENT_PROTO_PATH = '/usr/src/proto/ride_payment.proto';

// Load proto definitions
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const ridePaymentDefinition = protoLoader.loadSync(RIDE_PAYMENT_PROTO_PATH);

const userLocationProto = grpc.loadPackageDefinition(packageDefinition).userLocation;
const ridePaymentProto = grpc.loadPackageDefinition(ridePaymentDefinition).ride_payment;

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

// Task queue with concurrency limit of 6
const taskQueue = async.queue(async (task) => {
  return task();
}, 6);  // Limit concurrency to 6

// Mock function to calculate estimated price
function calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude) {
  return Math.random() * 100;  // Random estimated price
}

// Service Discovery Configuration
const SERVICE_DISCOVERY_URL = process.env.SERVICE_DISCOVERY_URL || 'http://service-discovery:8500/register';
const SERVICE_NAME = process.env.SERVICE_NAME || 'user-location-service';
const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS || 'user-location-service';
const SERVICE_PORT = process.env.SERVICE_PORT || 50051;

// Function to register the service
async function registerService() {
    try {
        await axios.post('http://service-discovery:8500/register', {
            service_name: SERVICE_NAME,
            service_address: SERVICE_ADDRESS,
            service_port: SERVICE_PORT
        });
        console.log(`${SERVICE_NAME} registered with Service Discovery`);
    } catch (error) {
        console.error('Error registering service:', error.message);
    }
}

// Function to deregister the service
async function deregisterService() {
    try {
        await axios.post('http://service-discovery:8500/deregister', {
            service_name: SERVICE_NAME,
            service_address: SERVICE_ADDRESS,
            service_port: SERVICE_PORT
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
const wss = new WebSocket.Server({ port: 8080 });
console.log('WebSocket server is running on port 8080');

let wsClients = [];

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('A WebSocket client connected');
  wsClients.push(ws);

  ws.on('close', () => {
    console.log('A WebSocket client disconnected');
    wsClients = wsClients.filter(client => client !== ws);
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

// MakeOrder method with Redis caching
async function makeOrder(call, callback) {
  taskQueue.push(async () => {
    const { userId, startLongitude, startLatitude, endLongitude, endLatitude } = call.request;

    const orderId = uuidv4();  // Generate unique orderId
    const estimatedPrice = calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude);

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

    callback(null, { orderId, estimatedPrice });
  });
}

// AcceptOrder method with PostgreSQL insert
async function acceptOrder(call, callback) {
  taskQueue.push(async () => {
    const { orderId, driverId } = call.request;

    // Retrieve the order details from Redis cache
    const orderData = await redisClient.get(orderId);
    
    if (!orderData) {
      callback({
        code: grpc.status.NOT_FOUND,
        message: 'Order not found'
      });
      return;
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
      callback({
        code: grpc.status.INTERNAL,
        message: 'Error saving ride data'
      });
      return;
    }

    // Respond with the stored values
    callback(null, { 
      rideId, 
      userId: order.userId,
      startLongitude: order.startLongitude, 
      startLatitude: order.startLatitude, 
      endLongitude: order.endLongitude, 
      endLatitude: order.endLatitude, 
      estimatedPrice: order.estimatedPrice 
    });
  });
}

// FinishOrder method
async function finishOrder(call, callback) {
  taskQueue.push(async () => {
    const { rideId, realPrice } = call.request;

    const paymentStatus = 'notPaid';

    // Retrieve userId from PostgreSQL
    let userId;
    try {
      const res = await pool.query('SELECT userId FROM rides WHERE rideId = $1', [rideId]);
      if (res.rows.length > 0) {
        userId = res.rows[0].userid;
      } else {
        callback({
          code: grpc.status.NOT_FOUND,
          message: 'Ride not found'
        });
        return;
      }
    } catch (err) {
      console.error('Error querying PostgreSQL:', err);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Error retrieving ride data'
      });
      return;
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

    callback(null, { paymentStatus, userId });
  });
}

// PaymentCheck method (remains unchanged)
async function paymentCheck(call, callback) {
  taskQueue.push(async () => {
    const { rideId } = call.request;

    // Retrieve userId from PostgreSQL
    let userId;
    try {
      const res = await pool.query('SELECT userId FROM rides WHERE rideId = $1', [rideId]);
      if (res.rows.length > 0) {
        userId = res.rows[0].userid;
      } else {
        callback({
          code: grpc.status.NOT_FOUND,
          message: 'Ride not found'
        });
        return;
      }
    } catch (err) {
      console.error('Error querying PostgreSQL:', err);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Error retrieving ride data'
      });
      return;
    }

    const ridePaymentClient = new ridePaymentProto.RidePaymentService(
      'ride-payment-service:50052',  // Use service name for discovery
      grpc.credentials.createInsecure()
    );

    const paymentRequest = { rideId };

    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 10);

    ridePaymentClient.ProcessPayment(paymentRequest, { deadline }, (error, response) => {
      if (error) {
        console.error('Error communicating with RidePaymentService:', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Error fetching payment status'
        });
      } else {
        callback(null, { status: response.status, userId });
      }
    });
  });
}

// gRPC server setup
const server = new grpc.Server();
server.addService(userLocationProto.UserLocationService.service, { 
  MakeOrder: makeOrder, 
  AcceptOrder: acceptOrder,
  FinishOrder: finishOrder,
  PaymentCheck: paymentCheck
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('User Location Service is running on port 50051');
    server.start();
});

// Express app for status
app.get('/status', (req, res) => {
    res.status(200).json({ status: 'User Location Service is running' });
});

// Start the status server
app.listen(4001, () => {
    console.log('User Location Service Status Endpoint is running on port 4001');
});
