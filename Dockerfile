# Playwright image: ships Chromium for the browser collection channel.
FROM mcr.microsoft.com/playwright:v1.65.1-noble
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
# DATABASE_PATH points at the mounted volume; MOCK_BASE_URL at this same server.
CMD ["sh", "-c", "MOCK_BASE_URL=${MOCK_BASE_URL:-http://localhost:${PORT:-3000}} npx next start -p ${PORT:-3000}"]
