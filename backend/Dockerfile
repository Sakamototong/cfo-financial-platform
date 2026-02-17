FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies inside the image to avoid host permission issues
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN chmod -R 755 /app/node_modules/.bin || true
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
# copy static public assets (swagger UI extension files) from build context
COPY public ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]
