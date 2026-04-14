/**
 * Phase 9: Relations Schema Validation Tests
 *
 * Tests for relation field builders and schema validation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter, validateRelationsSchema, normalizeSchema } from '../helpers/flashcore-compat.js'
import type { NormalizedSchema } from '../helpers/flashcore-compat.js'

describe('Phase 9: Relations Schema Validation', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Relation Field Builders', () => {
		it('should support belongsTo (f.relation)', () => {
			const schema = normalizeSchema({
				id: f.id(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})

			const authorRelation = schema.relations.get('author')
			expect(authorRelation).toBeDefined()
			expect(authorRelation?.type).toBe('belongsTo')
			expect(authorRelation?.model).toBe('User')
			expect(authorRelation?.foreignKey).toBe('authorId')
		})

		it('should support hasMany', () => {
			const schema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})

			const postsRelation = schema.relations.get('posts')
			expect(postsRelation).toBeDefined()
			expect(postsRelation?.type).toBe('hasMany')
			expect(postsRelation?.model).toBe('Post')
			expect(postsRelation?.foreignKey).toBe('authorId')
		})

		it('should support hasOne', () => {
			const schema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				profile: f.hasOne('Profile', { foreignKey: 'userId' })
			})

			const profileRelation = schema.relations.get('profile')
			expect(profileRelation).toBeDefined()
			expect(profileRelation?.type).toBe('hasOne')
			expect(profileRelation?.model).toBe('Profile')
			expect(profileRelation?.foreignKey).toBe('userId')
		})

		it('should support manyToMany', () => {
			const schema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				tags: f.manyToMany('Tag')
			})

			const tagsRelation = schema.relations.get('tags')
			expect(tagsRelation).toBeDefined()
			expect(tagsRelation?.type).toBe('manyToMany')
			expect(tagsRelation?.model).toBe('Tag')
		})

		it('should support onDelete options', () => {
			const schemaRestrict = normalizeSchema({
				id: f.id(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('restrict')
			})
			expect(schemaRestrict.relations.get('posts')?.onDelete).toBe('restrict')

			const schemaCascade = normalizeSchema({
				id: f.id(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('cascade')
			})
			expect(schemaCascade.relations.get('posts')?.onDelete).toBe('cascade')

			const schemaSetNull = normalizeSchema({
				id: f.id(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('setNull')
			})
			expect(schemaSetNull.relations.get('posts')?.onDelete).toBe('setNull')
		})
	})

	describe('Schema Validation', () => {
		it('should detect missing target model', () => {
			const models = new Map<string, NormalizedSchema>()

			// Post model references non-existent User model
			const postSchema = normalizeSchema({
				id: f.id(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})
			models.set('Post', postSchema)

			const errors = validateRelationsSchema(models)

			expect(errors.length).toBeGreaterThan(0)
			expect(errors[0].level).toBe('error')
			expect(errors[0].message).toContain("Target model 'User' does not exist")
		})

		it('should detect missing FK field in hasMany', () => {
			const models = new Map<string, NormalizedSchema>()

			// User model with hasMany to Post
			const userSchema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})
			models.set('User', userSchema)

			// Post model without authorId field
			const postSchema = normalizeSchema({
				id: f.id(),
				title: f.string()
			})
			models.set('Post', postSchema)

			const errors = validateRelationsSchema(models)

			expect(errors.some(e => e.level === 'error' && e.message.includes('authorId'))).toBe(true)
		})

		it('should warn about non-indexed FK', () => {
			const models = new Map<string, NormalizedSchema>()

			// User model
			const userSchema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})
			models.set('User', userSchema)

			// Post model with non-indexed FK
			const postSchema = normalizeSchema({
				id: f.id(),
				authorId: f.string() // Not indexed
			})
			models.set('Post', postSchema)

			const errors = validateRelationsSchema(models)

			expect(errors.some(e =>
				e.level === 'warning' &&
				e.message.includes('should be indexed')
			)).toBe(true)
		})

		it('should pass validation for correctly configured relations', () => {
			const models = new Map<string, NormalizedSchema>()

			// User model
			const userSchema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})
			models.set('User', userSchema)

			// Post model with indexed FK
			const postSchema = normalizeSchema({
				id: f.id(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})
			models.set('Post', postSchema)

			const errors = validateRelationsSchema(models)

			// Should only have warnings (if any), no errors
			expect(errors.filter(e => e.level === 'error').length).toBe(0)
		})
	})

	describe('Model Registration with Relations', () => {
		it('should register models with relations', async () => {
			const User = FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})

			const Post = FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})

			expect(User).toBeDefined()
			expect(Post).toBeDefined()

			const userRelations = User.getRelations()
			expect(userRelations.length).toBe(1)
			expect(userRelations[0].type).toBe('hasMany')

			const postRelations = Post.getRelations()
			expect(postRelations.length).toBe(1)
			expect(postRelations[0].type).toBe('belongsTo')
		})
	})
})
