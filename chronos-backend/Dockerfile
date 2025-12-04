# chronos-backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Сначала только package*.json — для кеша зависимостей
COPY package*.json ./

# Бэкенд у тебя собирается обычным node-сервером
# В dev у тебя nodemon, а в prod — "npm start"
RUN npm install --omit=dev

# Теперь весь исходник
COPY . .

ENV NODE_ENV=production
# В server.js порт по умолчанию 8000
EXPOSE 8000

CMD ["npm", "start"]
