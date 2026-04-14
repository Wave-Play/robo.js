export interface BenchmarkResult {
	name: string
	opsPerSec: number
	avgMs: number
	minMs: number
	maxMs: number
	samples: number
}

export interface BenchmarkOptions {
	warmupIterations?: number
	iterations?: number
	name: string
	fn: () => void | Promise<void>
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
	const { warmupIterations = 100, iterations = 1000, name, fn } = options

	// Warmup
	for (let i = 0; i < warmupIterations; i++) {
		await fn()
	}

	// Collect samples
	const times: number[] = []
	for (let i = 0; i < iterations; i++) {
		const start = performance.now()
		await fn()
		times.push(performance.now() - start)
	}

	const avgMs = times.reduce((a, b) => a + b, 0) / times.length
	const minMs = Math.min(...times)
	const maxMs = Math.max(...times)
	const opsPerSec = 1000 / avgMs

	return { name, opsPerSec, avgMs, minMs, maxMs, samples: iterations }
}

export function formatResults(results: BenchmarkResult[]): string {
	const nameWidth = Math.max(...results.map((r) => r.name.length), 4) + 2
	const header = `${'Name'.padEnd(nameWidth)} ${'ops/sec'.padStart(12)} ${'avg (ms)'.padStart(10)} ${'min (ms)'.padStart(10)} ${'max (ms)'.padStart(10)}`
	const separator = '-'.repeat(header.length)

	const rows = results.map((r) => {
		return `${r.name.padEnd(nameWidth)} ${r.opsPerSec.toFixed(0).padStart(12)} ${r.avgMs.toFixed(3).padStart(10)} ${r.minMs.toFixed(3).padStart(10)} ${r.maxMs.toFixed(3).padStart(10)}`
	})

	return [separator, header, separator, ...rows, separator].join('\n')
}
