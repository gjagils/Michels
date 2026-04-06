FROM node:20-alpine

# Chromium installeren voor whatsapp-web.js (Puppeteer)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Persistent volume voor WhatsApp sessie
VOLUME /data

EXPOSE 8400

CMD ["node", "src/index.js"]
