const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const PROTO_PATH = './ride_payment.proto';
const express = require('express');
const app = express();
const USER_LOCATION_PROTO = '/usr/src/proto/user_location.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const userLocationDefinition = protoLoader.loadSync(USER_LOCATION_PROTO);

const ridePaymentProto = grpc.loadPackageDefinition(packageDefinition).RidePaymentService;
const userLocationProto = grpc.loadPackageDefinition(userLocationDefinition).userLocation;

const server = new grpc.Server();

// Mock payment processing function
function processPayment(call, callback) {
    const { rideId, amount, userId } = call.request;

    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 5); // 5-second timeout

    // Call the User Location Service to get the user's location
    const client = new userLocationProto.UserLocationService(
        process.env.USER_LOCATION_HOST + ':' + process.env.USER_LOCATION_PORT,
        grpc.credentials.createInsecure()
    );

    client.SendLocation({ userId }, { deadline: deadline }, (error, locationResponse) => {        if (error) {
            callback(error);
        } else {
            // Process payment logic here (e.g., interacting with a payment gateway)
            const status = 'Payment Processed';
            callback(null, {
                status,
                userId,
                latitude: locationResponse.latitude,
                longitude: locationResponse.longitude,
            });
        }
    });
}

server.addService(ridePaymentProto.service, { ProcessPayment: processPayment });

server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Ride Payment Service is running on port 50052');
    server.start();
});


app.get('/status', (req, res) => {
  res.status(200).json({ status: 'Ride Payment Service is running' });
});

// Start Express Server
app.listen(4000, () => {
  console.log('Ride Payment Service Status Endpoint is running on port 4000');
});
