# chronos-frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite по умолчанию на 5173
EXPOSE 5173

# dev-сервер, чтобы не усложнять nginx’ом
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
