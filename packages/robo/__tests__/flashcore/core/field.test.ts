/** Phase 2: Core Unit Tests - Field Builder API */

import { f, Field, RelationField, compoundUnique } from '../../../src/flashcore/schema/field.js'

describe('Field Builder API', () => {
	describe('f.id()', () => {
		it('should create a Field with type=string and primaryKey=true', () => {
			const field = f.id()
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('string')
			expect(field._def.primaryKey).toBe(true)
		})
	})

	describe('f.string()', () => {
		it('should create a Field with type=string', () => {
			const field = f.string()
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('string')
		})
	})

	describe('f.number()', () => {
		it('should create a Field with type=number', () => {
			const field = f.number()
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('number')
		})
	})

	describe('f.boolean()', () => {
		it('should create a Field with type=boolean', () => {
			const field = f.boolean()
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('boolean')
		})
	})

	describe('f.date()', () => {
		it('should create a Field with type=date', () => {
			const field = f.date()
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('date')
		})
	})

	describe('f.json()', () => {
		it('should create a Field with type=json', () => {
			const field = f.json()
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('json')
		})
	})

	describe('f.enum()', () => {
		it('should create a Field with type=enum and enumValues', () => {
			const field = f.enum(['a', 'b', 'c'])
			expect(field).toBeInstanceOf(Field)
			expect(field._def.type).toBe('enum')
			expect(field._def.enumValues).toEqual(['a', 'b', 'c'])
		})
	})

	describe('Field modifiers', () => {
		it('.primaryKey() sets _def.primaryKey = true', () => {
			const field = f.string().primaryKey()
			expect(field._def.primaryKey).toBe(true)
		})

		it('.unique() sets _def.unique = true', () => {
			const field = f.string().unique()
			expect(field._def.unique).toBe(true)
		})

		it('.indexed() sets _def.indexed = true', () => {
			const field = f.string().indexed()
			expect(field._def.indexed).toBe(true)
		})

		it('.optional() sets _def.optional = true', () => {
			const field = f.string().optional()
			expect(field._def.optional).toBe(true)
		})

		it('.default(value) sets _def.hasDefault and _def.default', () => {
			const field = f.string().default('value')
			expect(field._def.hasDefault).toBe(true)
			expect(field._def.default).toBe('value')
		})

		it('.version() sets _def.version = true', () => {
			const field = f.number().version()
			expect(field._def.version).toBe(true)
		})

		it('.indexedWith(string) sets indexed and indexTypes', () => {
			const field = f.string().indexedWith('btree')
			expect(field._def.indexed).toBe(true)
			expect(field._def.indexTypes).toContain('btree')
		})

		it('.indexedWith(array) sets indexed and multiple indexTypes', () => {
			const field = f.string().indexedWith(['btree', 'hash'])
			expect(field._def.indexed).toBe(true)
			expect(field._def.indexTypes).toContain('btree')
			expect(field._def.indexTypes).toContain('hash')
		})

		it('chaining accumulates all flags correctly', () => {
			const field = f.string().unique().indexed().optional()
			expect(field._def.type).toBe('string')
			expect(field._def.unique).toBe(true)
			expect(field._def.indexed).toBe(true)
			expect(field._def.optional).toBe(true)
		})
	})

	describe('Field _isRelation', () => {
		it('should be false for Field instances', () => {
			const field = f.string()
			expect(field._isRelation).toBe(false)
		})
	})

	describe('Relation fields', () => {
		it('f.relation() creates RelationField with type=belongsTo', () => {
			const rel = f.relation('User', 'userId')
			expect(rel).toBeInstanceOf(RelationField)
			expect(rel._def.type).toBe('belongsTo')
			expect(rel._def.model).toBe('User')
			expect(rel._def.foreignKey).toBe('userId')
		})

		it('f.hasMany() creates RelationField with type=hasMany', () => {
			const rel = f.hasMany('Post', { foreignKey: 'authorId' })
			expect(rel).toBeInstanceOf(RelationField)
			expect(rel._def.type).toBe('hasMany')
			expect(rel._def.model).toBe('Post')
			expect(rel._def.foreignKey).toBe('authorId')
		})

		it('f.hasOne() creates RelationField with type=hasOne', () => {
			const rel = f.hasOne('Profile', { foreignKey: 'userId' })
			expect(rel).toBeInstanceOf(RelationField)
			expect(rel._def.type).toBe('hasOne')
			expect(rel._def.model).toBe('Profile')
			expect(rel._def.foreignKey).toBe('userId')
		})

		it('f.manyToMany() creates RelationField with type=manyToMany', () => {
			const rel = f.manyToMany('Tag')
			expect(rel).toBeInstanceOf(RelationField)
			expect(rel._def.type).toBe('manyToMany')
			expect(rel._def.model).toBe('Tag')
		})

		it('RelationField _isRelation is true', () => {
			const rel = f.relation('User', 'userId')
			expect(rel._isRelation).toBe(true)
		})

		it('.onDelete(cascade) sets _def.onDelete to cascade', () => {
			const rel = f.relation('User', 'userId').onDelete('cascade')
			expect(rel._def.onDelete).toBe('cascade')
		})

		it('default onDelete is restrict', () => {
			const rel = f.relation('User', 'userId')
			expect(rel._def.onDelete).toBe('restrict')
		})
	})

	describe('compoundUnique', () => {
		it('should return object with _type and fields', () => {
			const result = compoundUnique(['a', 'b'])
			expect(result).toEqual({ _type: 'compoundUnique', fields: ['a', 'b'] })
		})
	})
})
