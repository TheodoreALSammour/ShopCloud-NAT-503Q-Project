FROM node:20-alpine

WORKDIR /app

COPY services/cart/package*.json ./services/cart/
WORKDIR /app/services/cart
RUN npm install

WORKDIR /app
COPY shared ./shared
COPY services/cart ./services/cart

WORKDIR /app/services/cart
CMD ["npm","start"]
