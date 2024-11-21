FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Expose port 5001 for HTTP
EXPOSE 5001

# Expose port 8080 for WebSocket
EXPOSE 8080

CMD ["node", "index.js"]
