import type { RoboReply, RoboRequest } from '@robojs/server'

export interface Context {
	req: RoboRequest
	res: RoboReply
}
