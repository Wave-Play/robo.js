import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Flashcore } from 'robo.js'
import { Project, Task, Label, ProjectSettings } from '~/utils/models.js'
import { hasExtras } from '~/utils/extras.js'
import { getTaskStats } from '~/utils/kv.js'

export const config = createCommandConfig({
	description: 'Show database introspection info'
})

export default async (_interaction: ChatInputCommandInteraction) => {
	// Get actual record counts directly from models
	const [projectCount, taskCount, labelCount, settingsCount] = await Promise.all([
		Project.count({}),
		Task.count({}),
		Label.count({}),
		ProjectSettings.count({})
	])

	const stats = await getTaskStats()

	const lines = [
		'**Database Info**',
		'',
		'**Models:**',
		`  • Project: ${projectCount} records`,
		`  • Task: ${taskCount} records`,
		`  • Label: ${labelCount} records`,
		`  • ProjectSettings: ${settingsCount} records`,
		'',
		`**KV Stats:** ${stats.total} total, ${stats.open} open, ${stats.done} done`
	]

	// Supplement with introspection data
	try {
		const introspection = await Flashcore.$.introspect()
		lines.push(`**Storage:** ${introspection.storage.totalKeys} keys`)
		lines.push(`**WAL Pending:** ${introspection.walStatus.pendingEntries}`)
	} catch {
		// introspect may not be available
	}

	if (hasExtras()) {
		try {
			const validation = await Flashcore.$.validateSchemas()
			lines.push('')
			lines.push('**Schema Validation (flashcore-extras):**')
			lines.push(`Models validated: ${validation?.modelsValidated ?? 0}`)
			if (validation?.changedModels?.length) {
				lines.push(`Changed: ${validation.changedModels.map((m) => m.name).join(', ')}`)
			} else {
				lines.push('All schemas up to date')
			}
		} catch {
			lines.push('Schema validation unavailable')
		}
	} else {
		lines.push('')
		lines.push('_Install @robojs/flashcore-extras for extended features._')
	}

	return lines.join('\n')
}
