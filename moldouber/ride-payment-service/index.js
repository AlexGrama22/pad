const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();

const PROTO_PATH = '/usr/src/proto/ride_payment.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const ridePaymentProto = grpc.loadPackageDefinition(packageDefinition).RidePaymentService;

// Mock Payment Status
const paymentStatus = {};

// PayRide method
async function payRide(call, callback) {
  const { rideId, amount, userId } = call.request;

  paymentStatus[rideId] = 'orderPaid';  // Mark as paid for now

  callback(null, { rideId, status: 'orderPaid' });
}

// ProcessPayment method
async function processPayment(call, callback) {
  const { rideId } = call.request;

  const status = paymentStatus[rideId] || 'notPaid';

  callback(null, { rideId, status });

  // setTimeout(() => {
  //   callback(null, { rideId, status });
  // }, 11000); // 11-second delay
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

app.get('/status', (req, res) => {
    res.status(200).json({ status: 'Ride Payment Service is running' });
});

// Start the status server
app.listen(4000, () => {
  console.log('Ride Payment Service Status Endpoint is running on port 4000');
});
