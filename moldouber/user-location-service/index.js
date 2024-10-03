const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Pool } = require('pg'); // PostgreSQL client
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');  // For generating IDs
const express = require('express');
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

// Mock function to calculate estimated price
function calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude) {
  return Math.random() * 100;  // Random estimated price
}

// MakeOrder method with Redis caching
async function makeOrder(call, callback) {
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
}

// AcceptOrder method with PostgreSQL insert
async function acceptOrder(call, callback) {
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
    startLongitude: order.startLongitude, 
    startLatitude: order.startLatitude, 
    endLongitude: order.endLongitude, 
    endLatitude: order.endLatitude, 
    estimatedPrice: order.estimatedPrice 
  });
}

// FinishOrder method
async function finishOrder(call, callback) {
  const { rideId, realPrice } = call.request;

  const paymentStatus = 'notPaid';

  callback(null, { paymentStatus });
}

// PaymentCheck method (communicating with RidePaymentService)
async function paymentCheck(call, callback) {
  const { rideId } = call.request;

  const ridePaymentClient = new ridePaymentProto.RidePaymentService(
    'ride-payment-service:50052',  
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
      callback(null, { status: response.status });
    }
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
