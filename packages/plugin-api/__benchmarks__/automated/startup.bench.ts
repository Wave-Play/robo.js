import { runBenchmark, type BenchmarkResult } from './bench-runner.js'

export default async function (): Promise<BenchmarkResult[]> {
	const results: BenchmarkResult[] = []

	// Benchmark: Router initialization with varying route counts
	const { Router } = await import('../../src/core/router.js')

	for (const count of [10, 100, 1000]) {
		results.push(
			await runBenchmark({
				name: `Register ${count} routes`,
				fn: () => {
					const router = new Router()
					for (let i = 0; i < count; i++) {
						router.addRoute({ path: `/api/v1/resource-${i}/:id`, handler: () => null })
					}
				},
				iterations: 100,
				warmupIterations: 10
			})
		)
	}

	console.log('  Startup benchmarks complete')
	return results
}
