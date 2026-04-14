import type { RoboRequest } from '@robojs/server'
import { Project, Task } from '~/utils/models.js'

export default async (request: RoboRequest) => {
	const projects = await Project.findMany({ orderBy: { createdAt: 'desc' } })

	const result = await Promise.all(
		projects.map(async (p) => ({
			id: p.id,
			name: p.name,
			description: p.description,
			taskCount: await Task.count({ where: { projectId: p.id } })
		}))
	)

	return { projects: result }
}
