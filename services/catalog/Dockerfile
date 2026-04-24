FROM node:20-alpine

WORKDIR /app

COPY services/catalog/package*.json ./services/catalog/
WORKDIR /app/services/catalog
RUN npm install

WORKDIR /app
COPY shared ./shared
COPY services/catalog ./services/catalog

WORKDIR /app/services/catalog
CMD ["npm","start"]
