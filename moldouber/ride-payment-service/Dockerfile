# Use Node.js 14 as the base image
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./


# Install dependencies
RUN npm install

# Copy the rest of the application files (including .proto and index.js)
COPY . .

# Expose port 50052 for gRPC and 4000 for the HTTP status endpoint
EXPOSE 50052
EXPOSE 4000

# Command to run your service
CMD ["node", "index.js"]
