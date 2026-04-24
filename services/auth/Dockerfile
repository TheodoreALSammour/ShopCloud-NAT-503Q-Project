FROM node:20-alpine

WORKDIR /app

COPY services/auth/package*.json ./services/auth/
WORKDIR /app/services/auth
RUN npm install

WORKDIR /app
COPY shared ./shared
COPY services/auth ./services/auth

WORKDIR /app/services/auth
CMD ["npm","start"]
