# Build stage for the portal
FROM node:20-slim AS portal-build
WORKDIR /app/portal
COPY portal/package*.json ./
RUN npm install
COPY portal/ ./
RUN npm run build

# Final stage
FROM node:20-slim
WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm install --production

# Copy built portal assets
COPY --from=portal-build /app/portal/dist ./portal/dist

# Copy backend source
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
