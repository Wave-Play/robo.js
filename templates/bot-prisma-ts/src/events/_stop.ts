import { logger } from 'robo.js'

import { prisma } from './_start.js'

export default async function () {
	await prisma.$disconnect()
	logger.info('Disconnected from Prisma')
}
