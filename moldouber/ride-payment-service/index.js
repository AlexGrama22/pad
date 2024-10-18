// ride-payment-service/index.js

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { MongoClient } = require('mongodb');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const async = require('async'); // Import async for concurrency control
const axios = require('axios'); // Add axios for HTTP requests
const WebSocket = require('ws'); // Add WebSocket library
const app = express();

const PROTO_PATH = '/usr/src/proto/ride_payment.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const ridePaymentProto = grpc.loadPackageDefinition(packageDefinition).ride_payment;

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
const SERVICE_DISCOVERY_URL = process.env.SERVICE_DISCOVERY_URL || 'http://service-discovery:8500/register';
const SERVICE_NAME = process.env.SERVICE_NAME || 'ride-payment-service';
const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS || 'ride-payment-service';
const SERVICE_PORT = process.env.SERVICE_PORT || 50052;

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

// PayRide method
async function payRide(call, callback) {
  taskQueue.push(async () => {
    const { rideId, amount, userId } = call.request;

    // Store payment info in MongoDB
    await paymentsCollection.insertOne({ rideId, amount, userId, status: 'orderPaid' });

    callback(null, { rideId, status: 'orderPaid' });
  });
}

// ProcessPayment method
async function processPayment(call, callback) {
  taskQueue.push(async () => {
    const { rideId } = call.request;

    const payment = await paymentsCollection.findOne({ rideId });

    if (!payment) {
      callback({
        code: grpc.status.NOT_FOUND,
        message: 'Payment not found'
      });
      return;
    }

    callback(null, { rideId, status: payment.status });
  });
}

// gRPC server setup
const server = new grpc.Server();
server.addService(ridePaymentProto.RidePaymentService.service, { 
  PayRide: payRide,
  ProcessPayment: processPayment
});

server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Ride Payment Service is running on port 50052');
    server.start();
});

// Express app for status
app.get('/status', (req, res) => {
    res.status(200).json({ status: 'Ride Payment Service is running' });
});

// Start the status server
app.listen(4000, () => {
  console.log('Ride Payment Service Status Endpoint is running on port 4000');
});

// WebSocket client to connect to user-location-service
const ws = new WebSocket('ws://user-location-service:8080');

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

    // Optionally, you could send a confirmation back via WebSocket or gRPC
  }
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
