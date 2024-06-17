import type { RoboRequest } from '@robojs/server'

export default async (request: RoboRequest) => {
	return fetch(request.query.url as string)
}
