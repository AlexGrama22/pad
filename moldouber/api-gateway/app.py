from flask import Flask, jsonify, request
import grpc
from user_location_pb2_grpc import UserLocationServiceStub
from user_location_pb2 import UserRequest

app = Flask(__name__)

@app.route('/location', methods=['POST'])
def get_location():
    with grpc.insecure_channel('localhost:50051') as channel:
        stub = UserLocationServiceStub(channel)
        response = stub.SendLocation(UserRequest(userId=request.json['user_id']))
        return jsonify({'userId': response.userId, 'latitude': response.latitude, 'longitude': response.longitude})
 
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
