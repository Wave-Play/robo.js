import { logger } from 'robo.js'

import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export default async () => {
	logger.info('Connected to Prisma')
}
