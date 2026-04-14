/**
 * Flashcore v1 (spec rev 4.3) Integrity Module
 *
 * Integrity checking and repair utilities.
 */

export {
	rebuildCatalogFromChunks,
	verifyCatalogIntegrity,
	type CatalogRebuildResult,
	type CatalogRebuildOptions,
	type CatalogRebuildProgress,
	type CatalogVerificationResult
} from './catalog-rebuild.js'

export {
	IntegrityChecker,
	type FilterIntegrityResult,
	type IndexIntegrityResult,
	type UniqueIntegrityResult,
	type IntegrityReport,
	type IntegrityCheckOptions,
	type IntegrityCheckProgress
} from './check.js'

export {
	RepairEngine,
	type RepairResult,
	type FullRepairResult,
	type RepairOptions,
	type RepairProgress
} from './repair.js'
