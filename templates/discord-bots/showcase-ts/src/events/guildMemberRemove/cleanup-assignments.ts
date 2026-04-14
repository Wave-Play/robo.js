import type { EventConfig } from '@robojs/discordjs'
import type { GuildMember } from 'discord.js'
import { logger } from 'robo.js'
import { Task } from '~/utils/models.js'

export const config: EventConfig = {
	priority: 5
}

export default async (member: GuildMember) => {
	const result = await Task.updateMany({
		where: { assigneeId: member.id },
		data: { assigneeId: null as unknown as undefined }
	})

	if (result.count > 0) {
		logger.info(`Unassigned ${result.count} task(s) from departed member ${member.user.tag}`)
	}
}
