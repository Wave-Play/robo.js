import { createCommandConfig } from '@robojs/discordjs'
import { Project, Task } from '~/utils/models.js'
import { formatProjectHeader } from '~/utils/format.js'

export const config = createCommandConfig({
	description: 'List all projects'
})

export default async () => {
	const projects = await Project.findMany({ orderBy: { createdAt: 'desc' } })

	if (projects.length === 0) {
		return 'No projects found.'
	}

	const lines: string[] = []
	for (const project of projects) {
		const count = await Task.count({ where: { projectId: project.id } })
		lines.push(formatProjectHeader(project.name, count))
	}

	return lines.join('\n')
}
