import { Env } from 'robo.js'
import { defineConfig, env } from 'prisma/config'

Env.loadSync()
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
