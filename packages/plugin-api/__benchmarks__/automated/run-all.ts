import { formatResults, type BenchmarkResult } from './bench-runner.js'

async function main() {
	const results: BenchmarkResult[] = []

	console.log('Running @robojs/server benchmarks...\n')

	// Import and run each benchmark suite
	const suites = [
		() => import('./router.bench.js'),
		() => import('./startup.bench.js'),
		() => import('./hmr.bench.js'),
		() => import('./request-throughput.bench.js')
	]

	for (const loadSuite of suites) {
		const suite = await loadSuite()
		if (typeof suite.default === 'function') {
			const suiteResults = await suite.default()
			results.push(...suiteResults)
		}
	}

	console.log('\n' + formatResults(results))
}

main().catch(console.error)
