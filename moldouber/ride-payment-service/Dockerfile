FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Expose port 5002 for HTTP
EXPOSE 5002

CMD ["node", "index.js"]
