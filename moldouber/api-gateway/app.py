# api-gateway/app.py

from flask import Flask, request, jsonify
import os
import requests
import pybreaker
import threading
from datetime import datetime, timedelta
from prometheus_flask_exporter import PrometheusMetrics


app = Flask(__name__)
metrics = PrometheusMetrics(app)
metrics.info('app_info', 'API Gateway Information', version='1.0.0')
blacklist_lock = threading.Lock()

# Define metrics
REQUEST_COUNT = metrics.counter(
    'api_gateway_request_count_total', 
    'Total Request Count',
    labels={'method': lambda: request.method, 'endpoint': lambda: request.path, 'http_status': lambda: request.status_code}
)

REQUEST_LATENCY = metrics.histogram(
    'api_gateway_request_latency_seconds', 
    'Request latency',
    labels={'endpoint': lambda: request.path},
    buckets=(0.1, 0.5, 1, 2, 5)
)

# Since Nginx is the gateway to the services, we can simplify service discovery
NGINX_HOST = 'nginx'
NGINX_PORT = 80

SERVICE_HOSTS = {
    'user-location': [
        'http://user-location-service-1:5001',
        'http://user-location-service-2:5001'
    ],
    'ride-payment': [
        'http://ride-payment-service-1:5002',
        'http://ride-payment-service-2:5002'
    ]
}

blacklist = {}

def call_service_with_retry(endpoint, payload, service_type):
    retries_per_instance = 5  
    timeout = 10  
    blacklist_duration = timedelta(minutes=1)  

    if service_type not in SERVICE_HOSTS:
        raise ValueError(f"Unknown service type: {service_type}")

    service_instances = SERVICE_HOSTS[service_type]
    total_instances = len(service_instances)
    all_instances_blacklisted = True  # Flag to check if all instances are blacklisted

    for instance_index, host in enumerate(service_instances):
        instance_key = (service_type, instance_index)

        # Check if the instance is blacklisted
        with blacklist_lock:
            if instance_key in blacklist:
                if datetime.now() >= blacklist[instance_key]:
                    # Blacklist period has expired; remove from blacklist
                    del blacklist[instance_key]
                    print(f"Blacklist expired for instance {instance_index + 1} ({host}).")
                else:
                    # Instance is still blacklisted; skip to the next one
                    print(f"Instance {instance_index + 1} ({host}) is blacklisted until {blacklist[instance_key]}. Skipping...")
                    continue

        # If we reach here, the instance is not blacklisted
        all_instances_blacklisted = False  # At least one instance is available

        for retry in range(1, retries_per_instance + 1):
            try:
                url = f"{host}/{endpoint}"
                print(f"Attempt {retry}/{retries_per_instance} on instance {instance_index + 1} ({host})...")

                response = requests.post(url, json=payload, timeout=timeout)
                response.raise_for_status()  # Raises HTTPError for bad responses (4xx or 5xx)

                print(f"Success: Received response with status code {response.status_code} on instance {instance_index + 1}")
                return response

            except requests.exceptions.HTTPError as e:
                print(f"HTTPError on attempt {retry} for instance {instance_index + 1}: {e}")
            except requests.exceptions.RequestException as e:
                print(f"RequestException on attempt {retry} for instance {instance_index + 1}: {e}")

        # After all retries for the current instance have failed, add it to the blacklist
        with blacklist_lock:
            blacklist_expiry = datetime.now() + blacklist_duration
            blacklist[instance_key] = blacklist_expiry
            print(f"All {retries_per_instance} retries failed on instance {instance_index + 1} ({host}).")
            print(f"Instance {instance_index + 1} ({host}) has been blacklisted until {blacklist_expiry}.\n")

    if all_instances_blacklisted:
        # If all instances are currently blacklisted
        print("All instances are currently blacklisted. Circuit breaker is triggered.")
    else:
        # If some instances were available but all failed
        print("All available instances have failed. Circuit breaker is triggered.")

    # If all retries are exhausted on all instances, raise an exception with a custom message
    raise Exception("Circuit breaker is triggered. All instances are unavailable.")

def call_user_location_service(endpoint, payload):
    return call_service_with_retry(endpoint, payload, "user-location")

def call_ride_payment_service(endpoint, payload):
    return call_service_with_retry(endpoint, payload, "ride-payment")

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
    except Exception as e:
        # Catch all other exceptions
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
