const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = './ride_payment.proto';  // Ensure this path is correct

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const ridePaymentProto = grpc.loadPackageDefinition(packageDefinition);

if (!ridePaymentProto.RidePaymentService) {
  console.error('Failed to load gRPC service definition for RidePaymentService');
  process.exit(1);
}

function processPayment(call, callback) {
  // Payment processing logic here
  callback(null, { status: 'Payment processed' });
}

const server = new grpc.Server();
server.addService(ridePaymentProto.RidePaymentService.service, { processPayment });
server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
  console.log('Ride Payment Service running on port 50052');
  server.start();
});
