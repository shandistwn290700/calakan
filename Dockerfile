# CALAKAN – image production (dipakai Railway atau server Docker mana pun)
FROM oven/bun:1

# Zona waktu sekolah: WIB
ENV NODE_ENV=production \
    TZ=Asia/Jakarta
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .

# Jalankan sebagai pengguna biasa, bukan root
USER bun
EXPOSE 3000
CMD ["bun", "server.ts"]
