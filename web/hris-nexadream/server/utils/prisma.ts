import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '~~/generated/prisma/client'

// Satu klien per instance fungsi (Vercel). Gunakan URL pooler Neon di produksi.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set.')
  // Pool kecil per instance: banyak instance serverless berbagi pooler Neon. Bawaan pg = 10 koneksi,
  // yang di dev melampaui batas server lokal saat beberapa request berjalan bersamaan.
  const max = Number(process.env.DB_POOL_MAX) || 5
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max, idleTimeoutMillis: 10_000 }) })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
globalForPrisma.prisma = prisma
