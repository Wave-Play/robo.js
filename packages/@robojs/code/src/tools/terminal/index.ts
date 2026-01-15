/**
 * Terminal tools for @robojs/code SDK
 */

// One-shot tools
export { terminalRunTool, terminalRunSchema, type TerminalRunInput, type TerminalRunOutput } from './run.js'
export {
	terminalRunStreamTool,
	terminalRunStreamSchema,
	type TerminalRunStreamInput,
	type TerminalRunStreamOutput
} from './run-stream.js'

// Session tools
export {
	terminalSessionStartTool,
	terminalSessionStartSchema,
	type TerminalSessionStartInput,
	type TerminalSessionStartOutput
} from './session-start.js'
export {
	terminalSessionStreamTool,
	terminalSessionStreamSchema,
	type TerminalSessionStreamInput,
	type TerminalSessionStreamOutput
} from './session-stream.js'
export {
	terminalSessionStopTool,
	terminalSessionStopSchema,
	type TerminalSessionStopInput,
	type TerminalSessionStopOutput
} from './session-stop.js'

/**
 * All terminal tools
 */
import { terminalRunTool } from './run.js'
import { terminalRunStreamTool } from './run-stream.js'
import { terminalSessionStartTool } from './session-start.js'
import { terminalSessionStreamTool } from './session-stream.js'
import { terminalSessionStopTool } from './session-stop.js'

export const terminalTools = [
	terminalRunTool,
	terminalRunStreamTool,
	terminalSessionStartTool,
	terminalSessionStreamTool,
	terminalSessionStopTool
]
