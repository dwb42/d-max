FROM node:24-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

RUN npm install -g openclaw@latest

COPY . .

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/dmax.sqlite

VOLUME ["/app/data"]

CMD ["npm", "run", "start:container"]
