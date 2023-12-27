import { FastifyServer } from '../../../.robo/build/engines/fastify.js'

export default {
	// cors: true,
	prefix: null,
	server: new FastifyServer()
}
