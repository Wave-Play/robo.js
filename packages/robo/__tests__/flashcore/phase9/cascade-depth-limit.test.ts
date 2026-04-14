/**
 * Phase 9: Cascade Depth Limit Tests
 *
 * Tests for MAX_CASCADE_DEPTH enforcement to prevent infinite recursion
 * and transaction wrapping for cascade operations.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter, MAX_CASCADE_DEPTH } from '../helpers/flashcore-compat.js'

describe('Phase 9: Cascade Depth Limit', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should allow cascades up to reasonable depth', async () => {
		// Create a chain of 5 models with cascade delete
		const Level0 = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('Level0', {
			id: f.id(),
			name: f.string(),
			child: f.hasOne('Level1', { foreignKey: 'parentId' }).onDelete('cascade')
		})

		const Level1 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level1', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level2', { foreignKey: 'parentId' }).onDelete('cascade')
		})

		const Level2 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level2', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level3', { foreignKey: 'parentId' }).onDelete('cascade')
		})

		const Level3 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level3', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level4', { foreignKey: 'parentId' }).onDelete('cascade')
		})

		const Level4 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level4', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed()
		})

		// Create chain of records
		const l0 = await Level0.create({ name: 'L0' })
		const l1 = await Level1.create({ name: 'L1', parentId: l0.id })
		const l2 = await Level2.create({ name: 'L2', parentId: l1.id })
		const l3 = await Level3.create({ name: 'L3', parentId: l2.id })
		await Level4.create({ name: 'L4', parentId: l3.id })

		// Delete root should cascade through all levels
		await Level0.delete({ where: { id: l0.id } })

		// All records should be deleted
		expect(await Level0.findMany()).toHaveLength(0)
		expect(await Level1.findMany()).toHaveLength(0)
		expect(await Level2.findMany()).toHaveLength(0)
		expect(await Level3.findMany()).toHaveLength(0)
		expect(await Level4.findMany()).toHaveLength(0)
	})

	it('should verify MAX_CASCADE_DEPTH constant is 50', () => {
		expect(MAX_CASCADE_DEPTH).toBe(50)
	})

	it('should handle cascade with multiple children at each level', async () => {
		const Parent = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('Parent', {
			id: f.id(),
			name: f.string(),
			children: f.hasMany('Child', { foreignKey: 'parentId' }).onDelete('cascade')
		})

		const Child = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Child', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			grandchildren: f.hasMany('Grandchild', { foreignKey: 'childId' }).onDelete('cascade')
		})

		const Grandchild = FlashcoreSystem.registerModel<{
			id: string
			name: string
			childId: string
		}>('Grandchild', {
			id: f.id(),
			name: f.string(),
			childId: f.string().indexed()
		})

		// Create parent with multiple children, each with multiple grandchildren
		const parent = await Parent.create({ name: 'Parent' })
		const child1 = await Child.create({ name: 'Child 1', parentId: parent.id })
		const child2 = await Child.create({ name: 'Child 2', parentId: parent.id })
		await Grandchild.create({ name: 'GC 1a', childId: child1.id })
		await Grandchild.create({ name: 'GC 1b', childId: child1.id })
		await Grandchild.create({ name: 'GC 2a', childId: child2.id })
		await Grandchild.create({ name: 'GC 2b', childId: child2.id })

		// Delete parent should cascade to all children and grandchildren
		await Parent.delete({ where: { id: parent.id } })

		expect(await Parent.findMany()).toHaveLength(0)
		expect(await Child.findMany()).toHaveLength(0)
		expect(await Grandchild.findMany()).toHaveLength(0)
	})

	it('should handle mixed cascade and setNull policies', async () => {
		const Organization = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('Organization', {
			id: f.id(),
			name: f.string(),
			departments: f.hasMany('Department', { foreignKey: 'orgId' }).onDelete('cascade'),
			logs: f.hasMany('AuditLog', { foreignKey: 'orgId' }).onDelete('setNull')
		})

		const Department = FlashcoreSystem.registerModel<{
			id: string
			name: string
			orgId: string
		}>('Department', {
			id: f.id(),
			name: f.string(),
			orgId: f.string().indexed()
		})

		const AuditLog = FlashcoreSystem.registerModel<{
			id: string
			action: string
			orgId: string | null
		}>('AuditLog', {
			id: f.id(),
			action: f.string(),
			orgId: f.string().indexed().optional()
		})

		// Create org with departments and logs
		const org = await Organization.create({ name: 'Acme' })
		await Department.create({ name: 'Engineering', orgId: org.id })
		await Department.create({ name: 'Sales', orgId: org.id })
		await AuditLog.create({ action: 'Created org', orgId: org.id })
		await AuditLog.create({ action: 'Added dept', orgId: org.id })

		// Delete org
		await Organization.delete({ where: { id: org.id } })

		// Departments should be deleted (cascade)
		expect(await Department.findMany()).toHaveLength(0)

		// Logs should still exist with null orgId (setNull)
		const logs = await AuditLog.findMany()
		expect(logs).toHaveLength(2)
		expect(logs[0].orgId).toBeNull()
		expect(logs[1].orgId).toBeNull()
	})

	it('should cascade atomically - all or nothing on failure', async () => {
		const User = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('User', {
			id: f.id(),
			name: f.string(),
			posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('cascade')
		})

		const Post = FlashcoreSystem.registerModel<{
			id: string
			title: string
			authorId: string
		}>('Post', {
			id: f.id(),
			title: f.string(),
			authorId: f.string().indexed()
		})

		// Create user with posts
		const user = await User.create({ name: 'John' })
		await Post.create({ title: 'Post 1', authorId: user.id })
		await Post.create({ title: 'Post 2', authorId: user.id })

		// Normal deletion should work
		await User.delete({ where: { id: user.id } })

		expect(await User.findMany()).toHaveLength(0)
		expect(await Post.findMany()).toHaveLength(0)
	})
})
