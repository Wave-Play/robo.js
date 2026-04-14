/**
 * Flashcore v1 (spec rev 4.3) Relation Module
 *
 * Exports for relation management, cascade operations, and includes.
 */

// Types
export type {
	CascadeOp,
	IncludeClause,
	IncludeOptions,
	IncludeContext,
	JunctionTableDef,
	ParsedIncludeEntry,
	RelationInfo,
	RelationValidationError,
	BatchedIncludeResult,
	ManyToManyConnect,
	RelationFieldValue
} from './types.js'

// Junction table management
export {
	JunctionTableManager,
	getJunctionModelName,
	getJunctionTableDef,
	createJunctionSchema,
	isJunctionModel,
	parseJunctionModelName,
	resolveJunctionFKs,
	bulkDeleteByFK
} from './junction.js'

// Foreign key validation
export {
	validateForeignKey,
	validateForeignKeys,
	validateRelationsSchema,
	getForeignKeyRelation,
	getRelationsRequiringFKValidation,
	hasUpdatedForeignKeys
} from './validation.js'

// Cascade operations
export {
	collectCascadeOperations,
	executeCascadeOperations,
	checkRestrictConstraints,
	getRestrictRelations,
	hasCascadeRelations,
	findJunctionModelsForModel,
	type CascadeContext
} from './cascade.js'

// Include resolution
export {
	resolveInclude,
	resolveIncludesBatched,
	parseIncludeClause,
	hasIncludes,
	countIncludeDepth
} from './include.js'
