FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/

# Persistent volume voor WhatsApp sessie
VOLUME /data

EXPOSE 8400

CMD ["node", "src/index.js"]
