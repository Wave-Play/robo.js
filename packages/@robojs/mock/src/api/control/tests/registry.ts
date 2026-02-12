import type { RoboRequest } from '@robojs/server'
import { readRegistry } from '../../../session/registry.js'

/**
 * GET /api/control/tests/registry - Get the current test session registry
 *
 * Response:
 * {
 *   registry: TestSessionRegistry | null
 * }
 */
export async function GET(request: RoboRequest) {
	const registry = readRegistry()

	return {
		registry
	}
}
