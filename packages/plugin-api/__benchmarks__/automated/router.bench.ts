import { runBenchmark, type BenchmarkResult } from './bench-runner.js'

export default async function (): Promise<BenchmarkResult[]> {
	// Dynamically import to avoid module issues
	const { Router } = await import('../../src/core/router.js')
	const results: BenchmarkResult[] = []

	// Benchmark 1: Static lookup with varying route counts
	for (const count of [1, 10, 100, 1000]) {
		const router = new Router()
		for (let i = 0; i < count; i++) {
			router.addRoute({ path: `/route-${i}`, handler: () => null })
		}
		// Lookup the middle route
		const targetPath = `/route-${Math.floor(count / 2)}`

		results.push(
			await runBenchmark({
				name: `Static lookup (${count} routes)`,
				fn: () => {
					router.find(targetPath)
				},
				iterations: 10000
			})
		)
	}

	// Benchmark 2: Dynamic :param matching
	{
		const router = new Router()
		for (let i = 0; i < 100; i++) {
			router.addRoute({ path: `/api/v${i}/users/:id`, handler: () => null })
		}
		results.push(
			await runBenchmark({
				name: 'Dynamic :param match',
				fn: () => {
					router.find('/api/v50/users/12345')
				},
				iterations: 10000
			})
		)
	}

	// Benchmark 3: Wildcard matching
	{
		const router = new Router()
		router.addRoute({ path: '/files/**:path', handler: () => null })
		results.push(
			await runBenchmark({
				name: 'Wildcard match',
				fn: () => {
					router.find('/files/a/b/c/d.txt')
				},
				iterations: 10000
			})
		)
	}

	// Benchmark 4: Route miss
	{
		const router = new Router()
		for (let i = 0; i < 100; i++) {
			router.addRoute({ path: `/route-${i}`, handler: () => null })
		}
		results.push(
			await runBenchmark({
				name: 'Route miss',
				fn: () => {
					router.find('/nonexistent')
				},
				iterations: 10000
			})
		)
	}

	// Benchmark 5: Query parsing
	for (const paramCount of [0, 5, 20]) {
		const router = new Router()
		router.addRoute({ path: '/test', handler: () => null })
		const queryString =
			paramCount > 0 ? '?' + Array.from({ length: paramCount }, (_, i) => `key${i}=value${i}`).join('&') : ''

		results.push(
			await runBenchmark({
				name: `Query parse (${paramCount} params)`,
				fn: () => {
					router.find(`/test${queryString}`)
				},
				iterations: 10000
			})
		)
	}

	// Benchmark 6: Insert/removal throughput
	{
		results.push(
			await runBenchmark({
				name: 'Insert 1000 routes',
				fn: () => {
					const router = new Router()
					for (let i = 0; i < 1000; i++) {
						router.addRoute({ path: `/route-${i}`, handler: () => null })
					}
				},
				iterations: 100,
				warmupIterations: 10
			})
		)
	}

	console.log('  Router benchmarks complete')
	return results
}
