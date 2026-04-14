/**
 * Phase 9: Namespaced Relations Tests
 *
 * Ensures relations (FK validation, include, and many-to-many junctions)
 * resolve correctly within Flashcore namespaces and do not leak across them.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'

describe('Phase 9: Namespaced Relations', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should validate FKs and include belongsTo within the same namespace', async () => {
		const schema = FlashcoreSystem.schema('app')

		const User = schema.model<{ id: string; name: string }>('User', {
			id: f.id(),
			name: f.string(),
			posts: f.hasMany('Post', { foreignKey: 'authorId' })
		})

		const Post = schema.model<{ id: string; title: string; authorId: string }>('Post', {
			id: f.id(),
			title: f.string(),
			authorId: f.string().indexed(),
			author: f.relation('User', 'authorId')
		})

		await User.create({ id: 'user-1', name: 'Alice' })
		await expect(
			Post.create({ id: 'post-bad', title: 'Bad', authorId: 'missing-user' })
		).rejects.toThrow(/foreign key/i)

		const post = await Post.create({ id: 'post-1', title: 'Hello', authorId: 'user-1' })

		const result = await Post.findUnique({
			where: { id: post.id },
			include: { author: true }
		})

		expect(result).toBeDefined()
		expect((result as Record<string, unknown>).author).toBeDefined()
		expect(((result as Record<string, unknown>).author as { name: string }).name).toBe('Alice')
	})

	it('should namespace manyToMany junction data (no cross-namespace leaks)', async () => {
		const schemaA = FlashcoreSystem.schema('nsA')
		const schemaB = FlashcoreSystem.schema('nsB')

		const StudentA = schemaA.model<{ id: string; name: string }>('Student', {
			id: f.id(),
			name: f.string(),
			courses: f.manyToMany('Course')
		})
		schemaA.model<{ id: string; title: string }>('Course', {
			id: f.id(),
			title: f.string(),
			students: f.manyToMany('Student')
		})

		const StudentB = schemaB.model<{ id: string; name: string }>('Student', {
			id: f.id(),
			name: f.string(),
			courses: f.manyToMany('Course')
		})
		schemaB.model<{ id: string; title: string }>('Course', {
			id: f.id(),
			title: f.string(),
			students: f.manyToMany('Student')
		})

		// Use colliding IDs across namespaces to prove junction isolation.
		await StudentA.create({ id: 'student-1', name: 'A' })
		const courseA = await FlashcoreSystem.getModel<{ id: string; title: string }>('nsA::Course')!.create({
			id: 'course-1',
			title: 'Math'
		})

		await StudentB.create({ id: 'student-1', name: 'B' })
		await FlashcoreSystem.getModel<{ id: string; title: string }>('nsB::Course')!.create({
			id: 'course-1',
			title: 'Science'
		})

		// Connect only in namespace A.
		await StudentA.update({
			where: { id: 'student-1' },
			data: {
				courses: {
					connect: [{ id: courseA.id }]
				}
			} as unknown as { name?: string }
		})

		const aWithCourses = await StudentA.findUnique({
			where: { id: 'student-1' },
			include: { courses: true }
		}) as unknown as { courses: Array<{ id: string }> } | null
		expect(aWithCourses?.courses).toHaveLength(1)

		const bWithCourses = await StudentB.findUnique({
			where: { id: 'student-1' },
			include: { courses: true }
		}) as unknown as { courses: Array<{ id: string }> } | null
		expect(bWithCourses?.courses).toHaveLength(0)
	})
})

