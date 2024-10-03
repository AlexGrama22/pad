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
    
    channel = grpc.insecure_channel(f"{ride_payment_host}:{ride_payment_port}")
    stub = ride_payment_pb2_grpc.RidePaymentServiceStub(channel)
    return stub

# gRPC client setup for the UserLocationService
def get_user_location_stub():
    user_location_host = os.getenv('USER_LOCATION_HOST', 'localhost')
    user_location_port = os.getenv('USER_LOCATION_PORT', '50051')
    
    channel = grpc.insecure_channel(f"{user_location_host}:{user_location_port}")
    stub = user_location_pb2_grpc.UserLocationServiceStub(channel)
    return stub

# Endpoint to create an order
@app.route('/api/user/make_order', methods=['POST'])
def make_order():
    data = request.json
    user_id = data.get('userId')
    start_long = data.get('startLongitude')
    start_lat = data.get('startLatitude')
    end_long = data.get('endLongitude')
    end_lat = data.get('endLatitude')

    if not all([user_id, start_long, start_lat, end_long, end_lat]):
        return jsonify({"error": "Missing required fields"}), 400

    stub = get_user_location_stub()

    order_request = user_location_pb2.OrderRequest(
        userId=user_id,
        startLongitude=start_long,
        startLatitude=start_lat,
        endLongitude=end_long,
        endLatitude=end_lat
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.MakeOrder(order_request, timeout=10.0)
        return jsonify({
            'orderId': response.orderId,
            'estimatedPrice': response.estimatedPrice
        })
    except grpc.RpcError as e:
        # Check if the error is due to a timeout and return a 408 error code
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return jsonify({"error": "Request timed out"}), 408
        else:
            return jsonify({"error": e.details()}), e.code().value

# Endpoint to accept an order
@app.route('/api/user/accept_order', methods=['POST'])
def accept_order():
    data = request.json
    order_id = data.get('orderId')
    driver_id = data.get('driverId')

    if not all([order_id, driver_id]):
        return jsonify({"error": "Missing required fields"}), 400

    stub = get_user_location_stub()

    accept_order_request = user_location_pb2.AcceptOrderRequest(
        orderId=order_id,
        driverId=driver_id
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.AcceptOrder(accept_order_request, timeout=10.0)
        return jsonify({
            'rideId': response.rideId,
            'startLongitude': response.startLongitude,
            'startLatitude': response.startLatitude,
            'endLongitude': response.endLongitude,
            'endLatitude': response.endLatitude,
            'estimatedPrice': response.estimatedPrice
        })
    except grpc.RpcError as e:
        # Check if the error is due to a timeout and return a 408 error code
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return jsonify({"error": "Request timed out"}), 408
        else:
            return jsonify({"error": e.details()}), e.code().value

# Endpoint to finish an order
@app.route('/api/user/finish_order', methods=['POST'])
def finish_order():
    data = request.json
    ride_id = data.get('rideId')
    real_price = data.get('realPrice')

    if not all([ride_id, real_price]):
        return jsonify({"error": "Missing required fields"}), 400

    stub = get_user_location_stub()

    finish_order_request = user_location_pb2.FinishOrderRequest(
        rideId=ride_id,
        realPrice=real_price
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.FinishOrder(finish_order_request, timeout=10.0)
        return jsonify({
            'paymentStatus': response.paymentStatus
        })
    except grpc.RpcError as e:
        # Check if the error is due to a timeout and return a 408 error code
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return jsonify({"error": "Request timed out"}), 408
        else:
            return jsonify({"error": e.details()}), e.code().value

# Endpoint to pay for a ride
@app.route('/api/ride/pay', methods=['POST'])
def pay_ride():
    data = request.json
    ride_id = data.get('rideId')
    amount = data.get('amount')
    user_id = data.get('userId')

    if not all([ride_id, amount, user_id]):
        return jsonify({"error": "Missing required fields"}), 400

    stub = get_ride_payment_stub()

    pay_ride_request = ride_payment_pb2.PayRideRequest(
        rideId=ride_id,
        amount=amount,
        userId=user_id
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.PayRide(pay_ride_request, timeout=10.0)
        return jsonify({
            'rideId': response.rideId,
            'status': response.status
        })
    except grpc.RpcError as e:
        # Check if the error is due to a timeout and return a 408 error code
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return jsonify({"error": "Request timed out"}), 408
        else:
            return jsonify({"error": e.details()}), e.code().value

# Endpoint to process payment
@app.route('/api/ride/process_payment', methods=['POST'])
def process_payment():
    data = request.json
    ride_id = data.get('rideId')

    if not ride_id:
        return jsonify({"error": "Missing required fields"}), 400

    stub = get_ride_payment_stub()

    process_payment_request = ride_payment_pb2.ProcessPaymentRequest(
        rideId=ride_id
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.ProcessPayment(process_payment_request, timeout=10.0)
        return jsonify({
            'rideId': response.rideId,
            'status': response.status
        })
    except grpc.RpcError as e:
        # Check if the error is due to a timeout and return a 408 error code
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return jsonify({"error": "Request timed out"}), 408
        else:
            return jsonify({"error": e.details()}), e.code().value


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
