import postgres from 'postgres'
import { logger } from 'robo.js'

export const sql = postgres({
	host: process.env.POSTGRES_HOST,
	port: process.env.POSTGRES_PORT,
	database: process.env.POSTGRES_DATABASE,
	username: process.env.POSTGRES_USERNAME,
	password: process.env.POSTGRES_PASSWORD
})

export default async () => {
	logger.info('Connected to PostgresDB')
}
