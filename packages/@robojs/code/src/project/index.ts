/**
 * Project understanding primitives for @robojs/code SDK
 *
 * This module provides ProjectIndex and ProjectOverview for:
 * - Scale: targeted retrieval instead of giant snapshots
 * - Reliability: grounded explanations based on real project structure
 * - Drift detection: fingerprint-based change detection
 */

// Caps and thresholds
export { INDEX_CAPS, OVERVIEW_CAPS, type IndexCaps, type OverviewCaps } from './caps.js'

// Fingerprint computation
export {
	computeFingerprint,
	computeFileFingerprint,
	computeQuickFingerprint,
	hasFingerprintChanged,
	hashContent,
	type FileFingerprint
} from './fingerprint.js'

// Robo project detection
export {
	detectRoboProject,
	buildRoboOverview,
	parsePackageJson,
	getRoboPackages,
	determineProjectKind,
	getRoboVersion,
	hasRoboConfig,
	type ParsedPackageJson
} from './robo-detection.js'

// Project indexer
export { ProjectIndexer, createProjectIndexer, type ProjectIndexerConfig } from './indexer.js'

// Project overview builder
export { ProjectOverviewBuilder, createProjectOverviewBuilder, type ProjectOverviewBuilderConfig } from './overview.js'
