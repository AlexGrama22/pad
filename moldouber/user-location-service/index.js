const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Correct path to your .proto file
const PROTO_PATH = './user_location.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

// If you're using a package in the proto file, access the package name here
const userLocationProto = grpc.loadPackageDefinition(packageDefinition).userLocation;

if (!userLocationProto || !userLocationProto.UserLocationService) {
  console.error('Failed to load gRPC service definition for UserLocationService');
  process.exit(1);
}

// Function to handle gRPC request and store location data
function sendLocation(call, callback) {
  const { userId } = call.request;

  // Static location for now (you can update to dynamic if required)
  const latitude = 47.01;
  const longitude = 28.84;

  // Insert location data into the PostgreSQL database
  const query = `INSERT INTO locations (user_id, latitude, longitude) VALUES ($1, $2, $3) RETURNING *`;
  const values = [userId, latitude, longitude];

  client.query(query, values, (err, res) => {
    if (err) {
      console.error('Error inserting data:', err.stack);
      callback(err);
    } else {
      console.log('Inserted data:', res.rows[0]);
      callback(null, { userId: userId, latitude: latitude, longitude: longitude });
    }
  });
}

const server = new grpc.Server();
server.addService(userLocationProto.UserLocationService.service, { sendLocation });
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('User Location Service running on port 50051');
  server.start();
});
