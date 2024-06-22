import { appRouter } from '../core/trpc.js'
import { registerRouter } from '@robojs/trpc'

export default () => {
	registerRouter(appRouter)
}
