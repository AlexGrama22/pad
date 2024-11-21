# api-gateway/app.py

from flask import Flask, request, jsonify
import os
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

    user_location_host, user_location_port = discover_service('user-location-service')
    if not user_location_host or not user_location_port:
        return jsonify({"error": "User Location Service not available"}), 503

    url = f"http://{user_location_host}:{user_location_port}/make_order"
    payload = {
        "userId": user_id,
        "startLongitude": start_long,
        "startLatitude": start_lat,
        "endLongitude": end_long,
        "endLatitude": end_lat
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to accept an order
@app.route('/api/user/accept_order', methods=['POST'])
def accept_order():
    data = request.json
    order_id = data.get('orderId')
    driver_id = data.get('driverId')

    if not all([order_id, driver_id]):
        return jsonify({"error": "Missing required fields"}), 400

    user_location_host, user_location_port = discover_service('user-location-service')
    if not user_location_host or not user_location_port:
        return jsonify({"error": "User Location Service not available"}), 503

    url = f"http://{user_location_host}:{user_location_port}/accept_order"
    payload = {
        "orderId": order_id,
        "driverId": driver_id
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to finish an order
@app.route('/api/user/finish_order', methods=['POST'])
def finish_order():
    data = request.json
    ride_id = data.get('rideId')
    real_price = data.get('realPrice')

    if not all([ride_id, real_price]):
        return jsonify({"error": "Missing required fields"}), 400

    user_location_host, user_location_port = discover_service('user-location-service')
    if not user_location_host or not user_location_port:
        return jsonify({"error": "User Location Service not available"}), 503

    url = f"http://{user_location_host}:{user_location_port}/finish_order"
    payload = {
        "rideId": ride_id,
        "realPrice": real_price
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to pay for a ride
@app.route('/api/ride/pay', methods=['POST'])
def pay_ride():
    data = request.json
    ride_id = data.get('rideId')
    amount = data.get('amount')
    user_id = data.get('userId')

    if not all([ride_id, amount, user_id]):
        return jsonify({"error": "Missing required fields"}), 400

    ride_payment_host, ride_payment_port = discover_service('ride-payment-service')
    if not ride_payment_host or not ride_payment_port:
        return jsonify({"error": "Ride Payment Service not available"}), 503

    url = f"http://{ride_payment_host}:{ride_payment_port}/pay_ride"
    payload = {
        "rideId": ride_id,
        "amount": amount,
        "userId": user_id
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to process payment
@app.route('/api/ride/process_payment', methods=['POST'])
def process_payment():
    data = request.json
    ride_id = data.get('rideId')

    if not ride_id:
        return jsonify({"error": "Missing required fields"}), 400

    ride_payment_host, ride_payment_port = discover_service('ride-payment-service')
    if not ride_payment_host or not ride_payment_port:
        return jsonify({"error": "Ride Payment Service not available"}), 503

    url = f"http://{ride_payment_host}:{ride_payment_port}/process_payment"
    payload = {
        "rideId": ride_id
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to check payment status
@app.route('/api/user/check_payment_status', methods=['POST'])
def check_payment_status():
    data = request.json
    ride_id = data.get('rideId')

    if not ride_id:
        return jsonify({"error": "Missing required fields"}), 400

    user_location_host, user_location_port = discover_service('user-location-service')
    if not user_location_host or not user_location_port:
        return jsonify({"error": "User Location Service not available"}), 503

    url = f"http://{user_location_host}:{user_location_port}/payment_check"
    payload = {
        "rideId": ride_id
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 404:
            return jsonify({
                'rideId': ride_id,
                'status': 'orderNotPaid'
            }), 200
        else:
            return jsonify(response.json()), response.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "API Gateway is running"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
