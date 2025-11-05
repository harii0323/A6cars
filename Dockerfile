FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json* ./
RUN npm install --production || npm install

# Bundle app source
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
