# Room of Errors — 프로덕션 컨테이너
FROM node:22-alpine
WORKDIR /app

# 의존성 설치(백엔드)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# 소스 복사(backend + frontend + assets)
COPY backend ./backend
COPY frontend ./frontend

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/backend
CMD ["node", "server.js"]
