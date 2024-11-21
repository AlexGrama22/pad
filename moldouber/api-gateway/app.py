# api-gateway/app.py

from flask import Flask, request, jsonify
import os
import requests
import pybreaker
from prometheus_flask_exporter import PrometheusMetrics


app = Flask(__name__)
metrics = PrometheusMetrics(app)
metrics.info('app_info', 'API Gateway Information', version='1.0.0')

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


def call_service_with_retry(endpoint, payload, service_type):
    retries_per_instance = 2  # Retry 3 times per instance
    total_instances = 2  # Number of total instances available
    attempts = 0  # Total attempts counter
    instance_index = 0  # Tracks the current instance being used

    while attempts < retries_per_instance * total_instances:
        try:
            # Construct the service URL
            url = f"http://{NGINX_HOST}:{NGINX_PORT}/{service_type}/{endpoint}"

            # Make the request
            response = requests.post(url, json=payload, timeout=30)

            # Get the upstream container name or IP from the response headers
            upstream_server = response.headers.get("X-Upstream-Server", f"Instance-{instance_index + 1}")

            # Log the attempt
            print(f"Attempt {attempts + 1} (Retry {attempts % retries_per_instance + 1}/{retries_per_instance} on {upstream_server}): Connecting to {url}")

            # Raise an HTTPError for bad responses (4xx and 5xx)
            response.raise_for_status()

            # Log success and return response
            print(f"Success: Connected to {upstream_server} and received response with status code {response.status_code}")
            return response

        except requests.exceptions.HTTPError as e:
            # Increment attempts and handle retries
            attempts += 1
            print(f"HTTPError on Instance-{instance_index + 1}, attempt {attempts}: {e}")

            # Check if retries on the current instance are exhausted
            if attempts % retries_per_instance == 0:
                # Switch to the next instance
                instance_index = (instance_index + 1) % total_instances
                print(f"Switching to the next instance: Instance-{instance_index + 1}")

            print(f"Retrying on Instance-{instance_index + 1} (Attempt {attempts % retries_per_instance + 1}/{retries_per_instance})...")

        except requests.exceptions.RequestException as e:
            # Increment attempts and handle retries
            attempts += 1
            print(f"RequestException on Instance-{instance_index + 1}, attempt {attempts}: {e}")

            # Check if retries on the current instance are exhausted
            if attempts % retries_per_instance == 0:
                # Switch to the next instance
                instance_index = (instance_index + 1) % total_instances
                print(f"Switching to the next instance: Instance-{instance_index + 1}")

            print(f"Retrying on Instance-{instance_index + 1} (Attempt {attempts % retries_per_instance + 1}/{retries_per_instance})...")

    # If all retries are exhausted
    raise Exception("Max retries exceeded. All instances are unavailable.")

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
