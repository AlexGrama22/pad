# Moldo-Uber
## Application Suitability
1. **Why is this application relevant?**
* **Efficient Transportation:** Ride-sharing apps provide convenient transportation solutions, especially in areas with limited public transport infrastructure (Ciocana Veche and Posta Veche).
* **Reduced Traffic Congestion:** By promoting shared rides, these apps help decrease the number of empty vehicles on the road, leading to less traffic congestion and a smaller carbon footprint.
* **Flexible Earnings for Drivers:**  Drivers have the opportunity to earn income on their own schedules, providing financial flexibility

2. **Why does this application require a microservice architecture?**
* **Scalability:** A ride-sharing app experiences fluctuating demand, requiring the ability to scale up or down quickly to accommodate peak usage. Microservices allow for independent scaling of specific components like the matching service or payment processing, ensuring optimal performance.
* **Modularity and Maintainability:** The diverse functionalities of a ride-sharing app (e.g., user management, ride matching, payments, location tracking) can be encapsulated within separate microservices. This enables independent development, deployment, and maintenance, facilitating continuous improvement and feature additions.
* **Fault Isolation:** In case of a service failure, microservices limit the impact to a specific area, preventing a complete system outage. For instance, if the payment service encounters issues, it won't disrupt the core ride-matching functionality.

## Service Boundaries
![Scheme](./images/scheme.png)

* **User Management Service:** Handles user registration, authentication, profile management, and communication.
* **Driver Management Service:** Manages driver registration, verification, ratings, and earnings.
* **Ride Matching Service:**  Matches riders with available drivers based on proximity and other criteria.
* **Location Tracking Service:** Tracks the real-time location of drivers and riders during trips.
* **Payment Service:** Handles payment processing for rides.
* **Notification Service:** Sends notifications to users and drivers (e.g., ride requests, driver arrival, payment confirmations).

## Technology Stack and Communication Patterns

* **User/Driver Management Service:**
    * Language: Python
    * Framework: Flask (RESTful API)
    * Database: PostgreSQL
* **Ride Matching Service:**
    * Language: Node.js
    * Framework: Express (RESTful API)
    * Database: MongoDB
* **Location Tracking Service:**
    * Language: Node.js 
    * Framework: Socket.IO 
    * Database: Redis (for real-time data)
* **Payment Service:**
    * Language: Python
    * Framework: Flask (RESTful API)
    * Integration with Payment Gateway (e.g., Stripe)
* **Notification Service:**
    * Language: Node.js
    * Framework: Express (RESTful API)
    * Integration with Push Notification Services (e.g., Firebase Cloud Messaging)

## Data Management
* **User Management Service:**
```
    /api/users/register - Creates a new user account.
    /api/users/login - Authenticates a user and returns a session token.
    /api/users/profile - Retrieves user profile details.
    /api/users/profile/update - Updates user profile information.
```
* **Driver Management Service:**

```
    /api/drivers/register - Registers a new driver.
    /api/drivers/verify - Verifies a driver's documents and information.
    /api/drivers/location - Updates a driver's real-time location.
    /api/drivers/earnings - Retrieves a driver's earnings history.
```
* **Ride Matching Service:**

```
    /api/rides/request - Requests a ride from a user.
    /api/rides/match - Matches a rider with an available driver.
    /api/rides/status - Retrieves the current status of a ride.
    /api/rides/review - Leaving a commenet/mark for the ride.
```

* **Payment Service:**

```
    /api/payments/process - Processes payment for a completed ride.
    /api/payments/history - Processes payment for a completed ride.
    /api/payments/confirmation - Processes payment for a completed ride.
    /api/payments/status - Processes payment for a completed ride.
```

* **Notification Service:**

```
    /api/notifications/send - Sends a notification to a user or driver.
```

* **Location Tracking Service:** *

```
   // Emitted by driver's client
    {
      "event": "location_update",
      "driver_id": "67890",
      "latitude": 47.003670,
      "longitude": 28.907089
    }
    
    // Emitted to rider's client (subscribed to a specific ride)
    {
      "event": "driver_location_update",
      "ride_id": "54321",
      "driver_location": {
      "latitude": 47.003672,
      "longitude": 28.907091
      }
    }
```



## Deployment and Scaling

* Containerization: Each microservice will be packaged into Docker containers for consistent deployment across different environments.
* Orchestration: Kubernetes will be used to manage the deployment, scaling, and load balancing of containers, ensuring high availability and efficient resource utilization.
