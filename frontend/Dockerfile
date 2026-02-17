FROM node:18-alpine AS builder
WORKDIR /app

# Allow injecting API base at build time
ARG VITE_API_BASE=http://localhost:3000
ENV VITE_API_BASE=${VITE_API_BASE}

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
# Ensure bin scripts are executable (fix permission issues from some host filesystems)
RUN chmod -R 755 /app/node_modules/.bin || true
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
