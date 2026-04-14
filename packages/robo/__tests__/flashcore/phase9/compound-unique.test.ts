/**
 * Phase 9: Compound Unique Constraints Tests
 *
 * Tests for compound unique constraints, particularly for junction tables
 * preventing duplicate relationships.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, compoundUnique, FlashcoreSystem, MemoryAdapter, UniqueConstraintError } from '../helpers/flashcore-compat.js'

describe('Phase 9: Compound Unique Constraints', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Junction Table Uniqueness', () => {
		it('should prevent duplicate junction relationships (compound unique)', async () => {
			const Tag = FlashcoreSystem.registerModel<{ id: string; name: string }>('Tag', {
				id: f.id(),
				name: f.string(),
				posts: f.manyToMany('Post')
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string }>('Post', {
				id: f.id(),
				title: f.string(),
				tags: f.manyToMany('Tag')
			})

			const tag = await Tag.create({ name: 'JavaScript' })
			const post = await Post.create({ title: 'Hello' })

			await Post.update({
				where: { id: post.id },
				data: { tags: { connect: [{ id: tag.id }] } } as unknown as { title?: string }
			})

			await expect(Post.update({
				where: { id: post.id },
				data: { tags: { connect: [{ id: tag.id }] } } as unknown as { title?: string }
			})).rejects.toThrow(UniqueConstraintError)
		})

		it('should support models with multiple indexed fields', async () => {
			// This simulates a junction table pattern
			const Enrollment = FlashcoreSystem.registerModel<{
				id: string
				studentId: string
				courseId: string
				enrolledAt: Date
			}>('Enrollment', {
				id: f.id(),
				studentId: f.string().indexed(),
				courseId: f.string().indexed(),
				enrolledAt: f.date()
			})

			const Student = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Student', {
				id: f.id(),
				name: f.string()
			})

			const Course = FlashcoreSystem.registerModel<{
				id: string
				title: string
			}>('Course', {
				id: f.id(),
				title: f.string()
			})

			// Create student and course
			const student = await Student.create({ name: 'Alice' })
			const course = await Course.create({ title: 'Math 101' })

			// Create enrollment
			const enrollment = await Enrollment.create({
				studentId: student.id,
				courseId: course.id,
				enrolledAt: new Date()
			})

			expect(enrollment).toBeDefined()
			expect(enrollment.studentId).toBe(student.id)
			expect(enrollment.courseId).toBe(course.id)
		})

		it('should allow querying by compound fields', async () => {
			const Membership = FlashcoreSystem.registerModel<{
				id: string
				userId: string
				groupId: string
				role: string
			}>('Membership', {
				id: f.id(),
				userId: f.string().indexed(),
				groupId: f.string().indexed(),
				role: f.string()
			})

			// Create memberships
			await Membership.create({ userId: 'user1', groupId: 'group1', role: 'admin' })
			await Membership.create({ userId: 'user1', groupId: 'group2', role: 'member' })
			await Membership.create({ userId: 'user2', groupId: 'group1', role: 'member' })

			// Query by userId
			const user1Memberships = await Membership.findMany({
				where: { userId: 'user1' }
			})
			expect(user1Memberships).toHaveLength(2)

			// Query by groupId
			const group1Memberships = await Membership.findMany({
				where: { groupId: 'group1' }
			})
			expect(group1Memberships).toHaveLength(2)
		})
	})

	describe('Compound Unique Enforcement via compoundUnique()', () => {
		it('should reject create with duplicate compound values', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
				status: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				status: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			await TaskModel.create({ title: 'Task A', projectId: 'p1', status: 'open' })

			// Same title+projectId should fail
			await expect(
				TaskModel.create({ title: 'Task A', projectId: 'p1', status: 'done' })
			).rejects.toThrow(UniqueConstraintError)
		})

		it('should allow different combinations of compound values', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			// Same title, different project
			await TaskModel.create({ title: 'Task A', projectId: 'p1' })
			const t2 = await TaskModel.create({ title: 'Task A', projectId: 'p2' })
			expect(t2).toBeDefined()

			// Different title, same project
			const t3 = await TaskModel.create({ title: 'Task B', projectId: 'p1' })
			expect(t3).toBeDefined()
		})

		it('should reject createMany with duplicate compound values', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			// Within-batch duplicate
			await expect(
				TaskModel.createMany({
					data: [
						{ title: 'Task A', projectId: 'p1' },
						{ title: 'Task A', projectId: 'p1' }
					]
				})
			).rejects.toThrow(UniqueConstraintError)
		})

		it('should reject createMany against existing compound values', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			await TaskModel.create({ title: 'Task A', projectId: 'p1' })

			await expect(
				TaskModel.createMany({
					data: [
						{ title: 'Task B', projectId: 'p1' },
						{ title: 'Task A', projectId: 'p1' }  // conflicts with existing
					]
				})
			).rejects.toThrow(UniqueConstraintError)
		})

		it('should skip compound duplicates with skipDuplicates in createMany', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			await TaskModel.create({ title: 'Task A', projectId: 'p1' })

			const result = await TaskModel.createMany({
				data: [
					{ title: 'Task B', projectId: 'p1' },
					{ title: 'Task A', projectId: 'p1' },  // conflicts - should skip
					{ title: 'Task C', projectId: 'p1' }
				],
				skipDuplicates: true
			})

			expect(result.count).toBe(2)
		})

		it('should skip within-batch compound duplicates with skipDuplicates', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			const result = await TaskModel.createMany({
				data: [
					{ title: 'Task A', projectId: 'p1' },
					{ title: 'Task A', projectId: 'p1' },  // within-batch duplicate - should skip
					{ title: 'Task B', projectId: 'p1' }
				],
				skipDuplicates: true
			})

			expect(result.count).toBe(2)
		})

		it('should reject update to conflicting compound values', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			await TaskModel.create({ title: 'Task A', projectId: 'p1' })
			const t2 = await TaskModel.create({ title: 'Task B', projectId: 'p1' })

			// Updating t2's title to match t1's compound key should fail
			await expect(
				TaskModel.update({
					where: { id: t2.id },
					data: { title: 'Task A' }
				})
			).rejects.toThrow(UniqueConstraintError)
		})

		it('should release compound constraint on delete (re-create succeeds)', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			const task = await TaskModel.create({ title: 'Task A', projectId: 'p1' })

			await TaskModel.delete({ where: { id: task.id } })

			// Should succeed after delete
			const recreated = await TaskModel.create({ title: 'Task A', projectId: 'p1' })
			expect(recreated).toBeDefined()
		})

		it('should allow update when compound values remain unchanged', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId: string
				status: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string(),
				status: f.string(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			const task = await TaskModel.create({ title: 'Task A', projectId: 'p1', status: 'open' })

			// Updating a non-compound field should work fine
			const updated = await TaskModel.update({
				where: { id: task.id },
				data: { status: 'done' }
			})
			expect(updated?.status).toBe('done')
		})

		it('should skip compound constraint when any value is null', async () => {
			const TaskModel = FlashcoreSystem.registerModel<{
				id: string
				title: string
				projectId?: string
			}>('Task', {
				id: f.id(),
				title: f.string(),
				projectId: f.string().optional(),
				_titleProject: compoundUnique(['title', 'projectId'])
			})

			// Both with null projectId should be allowed (no compound constraint enforced)
			await TaskModel.create({ title: 'Task A' })
			const t2 = await TaskModel.create({ title: 'Task A' })
			expect(t2).toBeDefined()
		})
	})

	describe('Different Pair Combinations', () => {
		it('should allow different pairs to be added', async () => {
			const Friendship = FlashcoreSystem.registerModel<{
				id: string
				userId: string
				friendId: string
				since: Date
			}>('Friendship', {
				id: f.id(),
				userId: f.string().indexed(),
				friendId: f.string().indexed(),
				since: f.date()
			})

			// Add different friend pairs
			await Friendship.create({ userId: 'alice', friendId: 'bob', since: new Date() })
			await Friendship.create({ userId: 'alice', friendId: 'charlie', since: new Date() })
			await Friendship.create({ userId: 'bob', friendId: 'charlie', since: new Date() })

			// All should exist
			const friendships = await Friendship.findMany()
			expect(friendships).toHaveLength(3)

			// Query Alice's friends
			const aliceFriends = await Friendship.findMany({
				where: { userId: 'alice' }
			})
			expect(aliceFriends).toHaveLength(2)
		})

		it('should support reverse lookups', async () => {
			const Follow = FlashcoreSystem.registerModel<{
				id: string
				followerId: string
				followeeId: string
			}>('Follow', {
				id: f.id(),
				followerId: f.string().indexed(),
				followeeId: f.string().indexed()
			})

			// Create follow relationships
			await Follow.create({ followerId: 'alice', followeeId: 'bob' })
			await Follow.create({ followerId: 'charlie', followeeId: 'bob' })
			await Follow.create({ followerId: 'alice', followeeId: 'charlie' })

			// Who Alice follows
			const aliceFollows = await Follow.findMany({
				where: { followerId: 'alice' }
			})
			expect(aliceFollows).toHaveLength(2)

			// Who follows Bob
			const bobFollowers = await Follow.findMany({
				where: { followeeId: 'bob' }
			})
			expect(bobFollowers).toHaveLength(2)
		})
	})

	describe('Unique Field Constraints', () => {
		it('should enforce unique field constraints', async () => {
			const UserProfile = FlashcoreSystem.registerModel<{
				id: string
				email: string
				username: string
			}>('UserProfile', {
				id: f.id(),
				email: f.string().unique(),
				username: f.string().unique()
			})

			// Create first user
			await UserProfile.create({ email: 'alice@example.com', username: 'alice' })

			// Try to create user with same email
			await expect(
				UserProfile.create({ email: 'alice@example.com', username: 'alice2' })
			).rejects.toThrow(/unique/i)

			// Try to create user with same username
			await expect(
				UserProfile.create({ email: 'alice2@example.com', username: 'alice' })
			).rejects.toThrow(/unique/i)

			// Create with different email and username should work
			const user2 = await UserProfile.create({ email: 'bob@example.com', username: 'bob' })
			expect(user2).toBeDefined()
		})

		it('should allow lookup by unique fields', async () => {
			const Account = FlashcoreSystem.registerModel<{
				id: string
				email: string
				name: string
			}>('Account', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const created = await Account.create({ email: 'test@example.com', name: 'Test User' })

			// Lookup by unique email
			const found = await Account.findUnique({
				where: { email: 'test@example.com' }
			})

			expect(found).toBeDefined()
			expect(found?.id).toBe(created.id)
			expect(found?.name).toBe('Test User')
		})
	})

	describe('Multiple Records with Same Partial Match', () => {
		it('should allow records that share one field value but differ in another', async () => {
			const TeamMember = FlashcoreSystem.registerModel<{
				id: string
				teamId: string
				userId: string
				role: string
			}>('TeamMember', {
				id: f.id(),
				teamId: f.string().indexed(),
				userId: f.string().indexed(),
				role: f.string()
			})

			// Same team, different users
			await TeamMember.create({ teamId: 'team1', userId: 'user1', role: 'lead' })
			await TeamMember.create({ teamId: 'team1', userId: 'user2', role: 'member' })
			await TeamMember.create({ teamId: 'team1', userId: 'user3', role: 'member' })

			// Same user, different teams
			await TeamMember.create({ teamId: 'team2', userId: 'user1', role: 'member' })
			await TeamMember.create({ teamId: 'team3', userId: 'user1', role: 'lead' })

			// Query team1 members
			const team1Members = await TeamMember.findMany({
				where: { teamId: 'team1' }
			})
			expect(team1Members).toHaveLength(3)

			// Query user1's teams
			const user1Teams = await TeamMember.findMany({
				where: { userId: 'user1' }
			})
			expect(user1Teams).toHaveLength(3)
		})
	})
})
