/**
 * Filesystem tools for @robojs/code SDK
 */

// Core tools
export { fsReadTool, fsReadSchema, type FsReadInput, type FsReadOutput } from './read.js'
export { fsReadManyTool, fsReadManySchema, type FsReadManyInput, type FsReadManyOutput } from './read-many.js'
export { fsWriteTool, fsWriteSchema, type FsWriteInput, type FsWriteOutput } from './write.js'
export { fsDeleteTool, fsDeleteSchema, type FsDeleteInput, type FsDeleteOutput } from './delete.js'
export { fsListTool, fsListSchema, type FsListInput, type FsListOutput, type ListEntry } from './list.js'
export {
	fsSearchTool,
	fsSearchSchema,
	type FsSearchInput,
	type FsSearchOutput,
	type SearchEntry,
	type SearchMatch
} from './search.js'
export { fsSnapshotTool, fsSnapshotSchema, type FsSnapshotInput, type FsSnapshotOutput } from './snapshot.js'

// Scale/retrieval tools
export { fsStatTool, fsStatSchema, type FsStatInput, type FsStatOutput } from './stat.js'
export { fsReadRangeTool, fsReadRangeSchema, type FsReadRangeInput, type FsReadRangeOutput } from './read-range.js'
export { fsReadHeadTool, fsReadHeadSchema, type FsReadHeadInput, type FsReadHeadOutput } from './read-head.js'
export { fsReadTailTool, fsReadTailSchema, type FsReadTailInput, type FsReadTailOutput } from './read-tail.js'
export { fsGrepTool, fsGrepSchema, type FsGrepInput, type FsGrepOutput, type GrepMatch } from './grep.js'
export {
	fsOutlineTool,
	fsOutlineSchema,
	type FsOutlineInput,
	type FsOutlineOutput,
	type OutlineSymbol,
	type SymbolType
} from './outline.js'

/**
 * All filesystem tools
 */
import { fsReadTool } from './read.js'
import { fsReadManyTool } from './read-many.js'
import { fsWriteTool } from './write.js'
import { fsDeleteTool } from './delete.js'
import { fsListTool } from './list.js'
import { fsSearchTool } from './search.js'
import { fsSnapshotTool } from './snapshot.js'
import { fsStatTool } from './stat.js'
import { fsReadRangeTool } from './read-range.js'
import { fsReadHeadTool } from './read-head.js'
import { fsReadTailTool } from './read-tail.js'
import { fsGrepTool } from './grep.js'
import { fsOutlineTool } from './outline.js'

export const fsTools = [
	fsReadTool,
	fsReadManyTool,
	fsWriteTool,
	fsDeleteTool,
	fsListTool,
	fsSearchTool,
	fsSnapshotTool,
	fsStatTool,
	fsReadRangeTool,
	fsReadHeadTool,
	fsReadTailTool,
	fsGrepTool,
	fsOutlineTool
]
