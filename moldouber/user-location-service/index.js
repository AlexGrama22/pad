const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Load .proto file from the correct path
const PROTO_PATH = '/usr/src/proto/user_location.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const userLocationProto = grpc.loadPackageDefinition(packageDefinition).userLocation;

// Initialize gRPC server
const server = new grpc.Server();

// Mock user location data
const userLocationData = {
    '123': { latitude: 47.010312, longitude: 28.843458 },
    '456': { latitude: 47.024099, longitude: 28.830384 },
};

// gRPC method for sending location
function sendLocation(call, callback) {
    const userId = call.request.userId;
    const location = userLocationData[userId] || { latitude: 0, longitude: 0 }; // Default location if not found
    callback(null, {
        userId,
        latitude: location.latitude,
        longitude: location.longitude,
    });
}

// Correctly add the service using the UserLocationService from userLocationProto
server.addService(userLocationProto.UserLocationService.service, { SendLocation: sendLocation });

// Bind the server to the specified port
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('User Location Service is running on port 50051');
    server.start();
});
