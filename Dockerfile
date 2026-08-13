FROM node:20-alpine

# git is nodig omdat @whiskeysockets/baileys zijn libsignal-dependency
# rechtstreeks van GitHub installeert (geen npm-registry package)
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY version.json ./

# Persistent volume voor WhatsApp sessie
VOLUME /data

EXPOSE 8400

CMD ["node", "src/index.js"]
