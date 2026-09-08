FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --global npm@11.6.2 && npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["sh", "-c", "NUXT_PUBLIC_SUPABASE_URL=\"$SUPABASE_URL\" NUXT_PUBLIC_SUPABASE_ANON_KEY=\"$SUPABASE_ANON_KEY\" NUXT_SUPABASE_SERVICE_ROLE_KEY=\"$SUPABASE_SERVICE_ROLE_KEY\" node .output/server/index.mjs"]
