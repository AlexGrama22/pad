# api-gateway/app.py

from flask import Flask, request, jsonify
import os
import requests

app = Flask(__name__)

# Since Nginx is the gateway to the services, we can simplify service discovery
NGINX_HOST = 'nginx'
NGINX_PORT = 80

def call_user_location_service(endpoint, payload):
    url = f"http://{NGINX_HOST}:{NGINX_PORT}/user-location/{endpoint}"
    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    return response

def call_ride_payment_service(endpoint, payload):
    url = f"http://{NGINX_HOST}:{NGINX_PORT}/ride-payment/{endpoint}"
    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    return response

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

    payload = {
        "userId": user_id,
        "startLongitude": start_long,
        "startLatitude": start_lat,
        "endLongitude": end_long,
        "endLatitude": end_lat
    }

    try:
        response = call_user_location_service('make_order', payload)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 503

# Endpoint to accept an order
@app.route('/api/user/accept_order', methods=['POST'])
def accept_order():
    data = request.json
    order_id = data.get('orderId')
    driver_id = data.get('driverId')

    if not all([order_id, driver_id]):
        return jsonify({"error": "Missing required fields"}), 400

    payload = {
        "orderId": order_id,
        "driverId": driver_id
    }

    try:
        response = call_user_location_service('accept_order', payload)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 503

# Endpoint to finish an order
@app.route('/api/user/finish_order', methods=['POST'])
def finish_order():
    data = request.json
    ride_id = data.get('rideId')
    real_price = data.get('realPrice')

    if not all([ride_id, real_price]):
        return jsonify({"error": "Missing required fields"}), 400

    payload = {
        "rideId": ride_id,
        "realPrice": real_price
    }

    try:
        response = call_user_location_service('finish_order', payload)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 503

# Endpoint to pay for a ride
@app.route('/api/ride/pay', methods=['POST'])
def pay_ride():
    data = request.json
    ride_id = data.get('rideId')
    amount = data.get('amount')
    user_id = data.get('userId')

    if not all([ride_id, amount, user_id]):
        return jsonify({"error": "Missing required fields"}), 400

    payload = {
        "rideId": ride_id,
        "amount": amount,
        "userId": user_id
    }

    try:
        response = call_ride_payment_service('pay_ride', payload)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 503

# Endpoint to process payment
@app.route('/api/ride/process_payment', methods=['POST'])
def process_payment():
    data = request.json
    ride_id = data.get('rideId')

    if not ride_id:
        return jsonify({"error": "Missing required fields"}), 400

    payload = {
        "rideId": ride_id
    }

    try:
        response = call_ride_payment_service('process_payment', payload)
        return jsonify(response.json()), response.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 503

# Endpoint to check payment status
@app.route('/api/user/check_payment_status', methods=['POST'])
def check_payment_status():
    data = request.json
    ride_id = data.get('rideId')

    if not ride_id:
        return jsonify({"error": "Missing required fields"}), 400

    payload = {
        "rideId": ride_id
    }

    try:
        response = call_user_location_service('payment_check', payload)
        if response.status_code == 404:
            return jsonify({
                'rideId': ride_id,
                'status': 'orderNotPaid'
            }), 200
        else:
            return jsonify(response.json()), response.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 503

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "API Gateway is running"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
