import { Analytics } from '@robojs/analytics'
import type { CommandConfig } from 'robo.js'

export const config: CommandConfig = {
	description: 'Replies with Pong!'
}

export default () => {
	Analytics.event({
		name: 'ping',
		userId: '1234',
		data: {}
	})
	Analytics.view('my-test-page', {
		userId: '1234',
		name: 'page_view',
		data: {
			page_location: 'https://robojs.dev/test-page',
			page_title: 'Test Page'
		}
	})
	return 'Pong!'
}
