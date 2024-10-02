from flask import Flask, request, jsonify
import os
import grpc
import ride_payment_pb2
import ride_payment_pb2_grpc
import user_location_pb2
import user_location_pb2_grpc

app = Flask(__name__)

# gRPC client setup for the RidePaymentService
def get_ride_payment_stub():
    ride_payment_host = os.getenv('RIDE_PAYMENT_HOST', 'localhost')
    ride_payment_port = os.getenv('RIDE_PAYMENT_PORT', '50052')
    
    # Create gRPC channel for RidePaymentService
    channel = grpc.insecure_channel(f"{ride_payment_host}:{ride_payment_port}")
    stub = ride_payment_pb2_grpc.RidePaymentServiceStub(channel)
    return stub

# gRPC client setup for the UserLocationService
def get_user_location_stub():
    user_location_host = os.getenv('USER_LOCATION_HOST', 'localhost')
    user_location_port = os.getenv('USER_LOCATION_PORT', '50051')
    
    # Create gRPC channel for UserLocationService
    channel = grpc.insecure_channel(f"{user_location_host}:{user_location_port}")
    stub = user_location_pb2_grpc.UserLocationServiceStub(channel)
    return stub

# Endpoint to process payments
@app.route('/api/payments/process', methods=['POST'])
def process_payment():
    data = request.json
    ride_id = data.get('rideId')
    amount = data.get('amount')
    user_id = data.get('userId')

    if not all([ride_id, amount, user_id]):
        return jsonify({"error": "Missing required fields"}), 400

    # Initialize RidePaymentService stub
    ride_payment_stub = get_ride_payment_stub()

    # Create a PaymentRequest object
    payment_request = ride_payment_pb2.PaymentRequest(
        rideId=ride_id,
        amount=amount,
        userId=user_id
    )
    
    try:
        # Call the ProcessPayment method on the gRPC service
        payment_response = ride_payment_stub.ProcessPayment(payment_request)
    except grpc.RpcError as e:
        app.logger.error(f"gRPC error: {e.details()}")  # Log the error for debugging
        return jsonify({"error": e.details()}), e.code().value[0]  # Only return the status code number


    return jsonify({
        'status': payment_response.status,
        'userId': payment_response.userId,
        'latitude': payment_response.latitude,
        'longitude': payment_response.longitude
    })

# Endpoint to get user location
@app.route('/api/user/location', methods=['POST'])
def get_user_location():
    data = request.json
    user_id = data.get('userId')

    if not user_id:
        return jsonify({"error": "Missing required fields"}), 400

    # Initialize UserLocationService stub
    user_location_stub = get_user_location_stub()

    # Create a UserRequest object
    user_request = user_location_pb2.UserRequest(userId=user_id)

    try:
        # Call the SendLocation method on the gRPC service
        location_response = user_location_stub.SendLocation(user_request)
    except grpc.RpcError as e:
        return jsonify({"error": e.details()}), e.code().value

    return jsonify({
        'userId': location_response.userId,
        'latitude': location_response.latitude,
        'longitude': location_response.longitude
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
