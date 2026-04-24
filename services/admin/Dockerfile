FROM node:20-alpine

WORKDIR /app

COPY services/admin/package*.json ./services/admin/
WORKDIR /app/services/admin
RUN npm install

WORKDIR /app
COPY shared ./shared
COPY services/admin ./services/admin

WORKDIR /app/services/admin
CMD ["npm","start"]
