import { runBenchmark, type BenchmarkResult } from './bench-runner.js'

export default async function (): Promise<BenchmarkResult[]> {
	const results: BenchmarkResult[] = []
	const { Router } = await import('../../src/core/router.js')

	// Benchmark: Route replacement (simulating HMR)
	{
		const router = new Router()
		for (let i = 0; i < 100; i++) {
			router.addRoute({ path: `/api/route-${i}`, handler: () => `v1-${i}` })
		}

		let version = 0
		results.push(
			await runBenchmark({
				name: 'Route replacement (100 routes)',
				fn: () => {
					const idx = version % 100
					router.addRoute({ path: `/api/route-${idx}`, handler: () => `v${version}` })
					version++
				},
				iterations: 10000
			})
		)
	}

	// Benchmark: Add + remove cycle
	{
		let counter = 0
		results.push(
			await runBenchmark({
				name: 'Add/remove cycle',
				fn: () => {
					const router = new Router()
					const path = `/api/temp-${counter++}`
					router.addRoute({ path, handler: () => null })
					router.removeRoute(path)
				},
				iterations: 5000
			})
		)
	}

	console.log('  HMR benchmarks complete')
	return results
}
