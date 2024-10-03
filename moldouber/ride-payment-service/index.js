const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { MongoClient } = require('mongodb');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
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

// PayRide method
async function payRide(call, callback) {
  const { rideId, amount, userId } = call.request;

  // Store payment info in MongoDB
  await paymentsCollection.insertOne({ rideId, amount, userId, status: 'orderPaid' });

  callback(null, { rideId, status: 'orderPaid' });
}

// ProcessPayment method
async function processPayment(call, callback) {
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

app.listen(4000, () => {
  console.log('Ride Payment Service Status Endpoint is running on port 4000');
});
