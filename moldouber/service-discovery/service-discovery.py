# service-discovery/service-discovery.py

from flask import Flask, request, jsonify
from threading import Lock

app = Flask(__name__)

# In-memory registry
registry = {}
lock = Lock()

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    service_name = data.get('service_name')
    service_address = data.get('service_address')
    service_port = data.get('service_port')
    
    if not all([service_name, service_address, service_port]):
        return jsonify({"error": "Missing required fields"}), 400
    
    with lock:
        if service_name not in registry:
            registry[service_name] = []
        # Avoid duplicate entries
        if not any(s['address'] == service_address and s['port'] == service_port for s in registry[service_name]):
            registry[service_name].append({
                "address": service_address,
                "port": service_port
            })
    
    return jsonify({"message": "Service registered successfully"}), 200

@app.route('/deregister', methods=['POST'])
def deregister():
    data = request.json
    service_name = data.get('service_name')
    service_address = data.get('service_address')
    service_port = data.get('service_port')
    
    if not all([service_name, service_address, service_port]):
        return jsonify({"error": "Missing required fields"}), 400
    
    with lock:
        if service_name in registry:
            registry[service_name] = [s for s in registry[service_name] if not (s['address'] == service_address and s['port'] == service_port)]
            if not registry[service_name]:
                del registry[service_name]
    
    return jsonify({"message": "Service deregistered successfully"}), 200

@app.route('/services/<service_name>', methods=['GET'])
def get_service(service_name):
    with lock:
        services = registry.get(service_name)
        if not services:
            return jsonify({"error": "Service not found"}), 404
        # For simplicity, return the first available service
        return jsonify(services[0]), 200
    

# **New /status Endpoint**
@app.route('/status', methods=['GET'])
def status():
    with lock:
        service_count = sum(len(instances) for instances in registry.values())
    return jsonify({
        "status": "Service Discovery is running",
        "registered_services": service_count
    }), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8500)
