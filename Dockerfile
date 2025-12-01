FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production || npm install

# Copy backend application
COPY backend .

# Create uploads directory
RUN mkdir -p uploads

# Port configuration for Render
ENV PORT=10000
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "server.js"]
