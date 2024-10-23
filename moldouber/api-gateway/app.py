# api-gateway/app.py

from flask import Flask, request, jsonify
import os
import grpc
import ride_payment_pb2
import ride_payment_pb2_grpc
import user_location_pb2
import user_location_pb2_grpc
import requests

app = Flask(__name__)

# Service Discovery Configuration
SERVICE_DISCOVERY_URL = os.getenv('SERVICE_DISCOVERY_URL', 'http://service-discovery:8500')

def discover_service(service_name):
    try:
        response = requests.get(f"{SERVICE_DISCOVERY_URL}/services/{service_name}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return data['address'], data['port']
        else:
            app.logger.error(f"Service {service_name} not found in Service Discovery")
            return None, None
    except Exception as e:
        app.logger.error(f"Error discovering service {service_name}: {str(e)}")
        return None, None

# gRPC client setup for the RidePaymentService
def get_ride_payment_stub():
    ride_payment_host, ride_payment_port = discover_service('ride-payment-service')
    if not ride_payment_host or not ride_payment_port:
        raise Exception("Ride Payment Service not available")
    
    channel = grpc.insecure_channel(f"{ride_payment_host}:{ride_payment_port}")
    stub = ride_payment_pb2_grpc.RidePaymentServiceStub(channel)
    return stub

# gRPC client setup for the UserLocationService
def get_user_location_stub():
    user_location_host, user_location_port = discover_service('user-location-service')
    if not user_location_host or not user_location_port:
        raise Exception("User Location Service not available")
    
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

    try:
        stub = get_user_location_stub()
    except Exception as e:
        return jsonify({"error": str(e)}), 503

    order_request = user_location_pb2.OrderRequest(
        userId=user_id,
        startLongitude=start_long,
        startLatitude=start_lat,
        endLongitude=end_long,
        endLatitude=end_lat
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.MakeOrder(order_request, timeout=10.001)
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

    try:
        stub = get_user_location_stub()
    except Exception as e:
        return jsonify({"error": str(e)}), 503

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

    try:
        stub = get_user_location_stub()
    except Exception as e:
        return jsonify({"error": str(e)}), 503

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

    try:
        stub = get_ride_payment_stub()
    except Exception as e:
        return jsonify({"error": str(e)}), 503

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

    try:
        stub = get_ride_payment_stub()
    except Exception as e:
        return jsonify({"error": str(e)}), 503

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

# Endpoint to check payment status
@app.route('/api/user/check_payment_status', methods=['POST'])
def check_payment_status():
    data = request.json
    ride_id = data.get('rideId')

    if not ride_id:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        stub = get_user_location_stub()
    except Exception as e:
        return jsonify({"error": str(e)}), 503

    payment_check_request = user_location_pb2.PaymentCheckRequest(
        rideId=ride_id
    )

    try:
        # Add a 10-second timeout to the gRPC call
        response = stub.PaymentCheck(payment_check_request, timeout=10.0)

        # If the status is "notPaid", return "orderNotPaid"
        if response.status == "notPaid":
            return jsonify({
                'rideId': ride_id,
                'status': 'orderNotPaid'
            })
        else:
            return jsonify({
                'rideId': ride_id,
                'status': response.status
            })

    except grpc.RpcError as e:
        # Handle NOT_FOUND error (status code 5) properly
        if e.code() == grpc.StatusCode.NOT_FOUND:
            return jsonify({
                'rideId': ride_id,
                'status': 'orderNotPaid'
            }), 200
        elif e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return jsonify({"error": "Request timed out"}), 408
        else:
            return jsonify({"error": e.details()}), e.code().value

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "API Gateway is running"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
