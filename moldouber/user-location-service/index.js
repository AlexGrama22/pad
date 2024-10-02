const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const express = require('express');
const app = express();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: 'postgres',  // Container name for PostgreSQL service
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432
});

// Load .proto file from the correct path
const PROTO_PATH = '/usr/src/proto/user_location.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const userLocationProto = grpc.loadPackageDefinition(packageDefinition).userLocation;

// Initialize gRPC server
const server = new grpc.Server();



// Dynamic user location generator function
function generateLocation(userId) {
    // Convert userId to a number for the dynamic generation
    const numericId = parseInt(userId, 10) || 0;

    // Generate dynamic latitude and longitude based on userId
    const latitude = 40 + (numericId % 10) * 0.1;  // For example, base latitude of 40, dynamic within a 1 degree range
    const longitude = -75 + (numericId % 10) * 0.1; // Base longitude of -75, dynamic within a 1 degree range

    return { latitude, longitude };
}

// gRPC method for sending location
function sendLocation(call, callback) {
    const userId = call.request.userId;

    // Generate dynamic latitude and longitude based on userId
    const location = generateLocation(userId);

    // Respond with the dynamic location
    callback(null, {
        userId,
        latitude: location.latitude,
        longitude: location.longitude
    });
}

// Add the service to the server
server.addService(userLocationProto.UserLocationService.service, { SendLocation: sendLocation });

// Bind the server to the specified port
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('User Location Service is running on port 50051');
    server.start();
});

app.get('/status', (req, res) => {
  res.status(200).json({ status: 'User Location Service is running' });
});

// Start Express Server
app.listen(4001, () => {
  console.log('User Location Service Status Endpoint is running on port 4001');
});
