const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');  // For generating IDs
const express = require('express');
const app = express();

const PROTO_PATH = '/usr/src/proto/user_location.proto';
const RIDE_PAYMENT_PROTO_PATH = '/usr/src/proto/ride_payment.proto';

// Load proto definitions
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const ridePaymentDefinition = protoLoader.loadSync(RIDE_PAYMENT_PROTO_PATH);

const userLocationProto = grpc.loadPackageDefinition(packageDefinition).userLocation;
const ridePaymentProto = grpc.loadPackageDefinition(ridePaymentDefinition).RidePaymentService;

// Mock function to calculate estimated price
function calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude) {
  return Math.random() * 100;  // Random estimated price
}

// Mock function to check payment status in local memory
function checkPaymentStatus(rideId) {
  return 'notPaid';  // For now, assume notPaid status
}

// MakeOrder method
const orders = {}; // In-memory store for orders

// MakeOrder method
async function makeOrder(call, callback) {
  const { userId, startLongitude, startLatitude, endLongitude, endLatitude } = call.request;

  const orderId = uuidv4();  // Generate unique orderId
  const estimatedPrice = calculateEstimatedPrice(startLatitude, startLongitude, endLatitude, endLongitude);

  // Store the order details in memory
  orders[orderId] = { userId, startLongitude, startLatitude, endLongitude, endLatitude, estimatedPrice };

  callback(null, { orderId, estimatedPrice });
}

// AcceptOrder method
async function acceptOrder(call, callback) {
  const { orderId, driverId } = call.request;

  // Retrieve the order details from memory
  const order = orders[orderId];
  
  if (!order) {
    callback({
      code: grpc.status.NOT_FOUND,
      message: 'Order not found'
    });
    return;
  }

  const rideId = uuidv4();  // Generate unique rideId

  // Retrieve the start/end coordinates from the order
  const { startLongitude, startLatitude, endLongitude, endLatitude, estimatedPrice } = order;

  // Respond with the stored values
  callback(null, { 
    rideId, 
    startLongitude, 
    startLatitude, 
    endLongitude, 
    endLatitude, 
    estimatedPrice 
  });
}

// FinishOrder method
async function finishOrder(call, callback) {
  const { rideId, realPrice } = call.request;

  const paymentStatus = checkPaymentStatus(rideId);

  callback(null, { paymentStatus });
}

// PaymentCheck method to communicate with RidePaymentService and get payment status
async function paymentCheck(call, callback) {
  const { rideId } = call.request;

  // Create the gRPC client for RidePaymentService using the loaded package definition
  const ridePaymentClient = new ridePaymentProto.RidePaymentService(
    'ride-payment-service:50052',  
    grpc.credentials.createInsecure()
  );

  const paymentRequest = { rideId: rideId };

  // Call the ProcessPayment method in RidePaymentService with a 10-second timeout
  const deadline = new Date();
  deadline.setSeconds(deadline.getSeconds() + 10);  // 10-second timeout

  ridePaymentClient.ProcessPayment(paymentRequest, { deadline }, (error, response) => {
    if (error) {
      console.error('Error communicating with RidePaymentService:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Error fetching payment status'
      });
    } else {
      // Return the status returned by RidePaymentService
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
  PaymentCheck: paymentCheck  // New PaymentCheck method
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
