import type { RoboRequest } from '@robojs/server'

export default async (req: RoboRequest) => {
	const body = await req.json()

	return {
		message: 'Hello from Robo.js API!',
		received: body,
		timestamp: new Date().toISOString(),
		compatibility: 'Robo.js + Next.js = 💜'
	}
}
