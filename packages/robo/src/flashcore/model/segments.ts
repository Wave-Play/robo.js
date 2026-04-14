import type { ChunkManager } from './chunk.js'
import type { SegmentWrite } from '../wal/types.js'

/**
 * Split a serialized record into deterministic segment writes.
 *
 * Segment size mirrors ChunkManager.saveSegmentedRecord():
 * `floor(maxChunkSize * 0.9)` to leave safety margin under adapter limits.
 */
export function splitRecordToSegments(
	chunkManager: ChunkManager,
	recordId: string,
	record: unknown,
	segmentCount?: number
): { segmentIds: string[]; segments: SegmentWrite[] } {
	const json = JSON.stringify(record)
	const rawSegmentSize = Math.floor(chunkManager.getMaxChunkSize() * 0.9)
	const segmentSize = Math.max(1, rawSegmentSize)

	const numSegments = typeof segmentCount === 'number' ? Math.max(0, segmentCount) : Math.ceil(json.length / segmentSize)
	const segments: SegmentWrite[] = []
	const segmentIds: string[] = []

	for (let i = 0; i < numSegments; i++) {
		const windowSize = typeof segmentCount === 'number'
			? Math.max(1, Math.ceil(json.length / Math.max(1, numSegments)))
			: segmentSize

		const data = json.slice(i * windowSize, (i + 1) * windowSize)
		const segmentKey = chunkManager.buildSegmentKey(recordId, i)
		segments.push({ segmentKey, index: i, data })
		segmentIds.push(`${i}`)
	}

	return { segmentIds, segments }
}
