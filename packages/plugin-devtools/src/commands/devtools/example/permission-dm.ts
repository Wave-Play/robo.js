import type { CommandConfig } from 'robo.js'

export const config: CommandConfig = {
	description: `This is an example command that can't be used in DMs`,
	dmPermission: false
}

export default () => {
	return 'This worked because you are not in a DM!'
}
