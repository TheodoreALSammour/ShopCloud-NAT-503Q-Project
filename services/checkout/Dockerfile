FROM node:20-alpine

WORKDIR /app

COPY services/checkout/package*.json ./services/checkout/
WORKDIR /app/services/checkout
RUN npm install

WORKDIR /app
COPY shared ./shared
COPY services/checkout ./services/checkout

WORKDIR /app/services/checkout
CMD ["npm","start"]
