FROM node:18-alpine

WORKDIR /usr/src/app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --production || npm install

COPY backend ./
RUN mkdir -p uploads

EXPOSE 3000

CMD ["npm", "start"]
