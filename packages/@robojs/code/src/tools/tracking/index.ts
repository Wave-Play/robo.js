/**
 * File tracking module for stale detection and content eviction
 */

export {
	FileReadTracker,
	checkStaleness,
	type FileReadSnapshot,
	type StaleCheckResult,
	type StaleReason,
	type CurrentFileState
} from './file-tracker.js'

export { FileSummarizer, createFileSummarizer, type FileSummary, type OutlineSymbol } from './file-summarizer.js'
