const PREFIXES = [
	'data',
	'neo',
	'quantum',
	'hexa',
	'fusion',
	'aether',
	'nano',
	'iridium',
	'xeno',
	'omega',
	'penta',
	'zeta',
	'hyper',
	'quantum',
	'photon',
	'infra',
	'zephyr',
	'ultra',
	'vortex',
	'cyber'
]

const SUFFIXES = [
	'forge',
	'pulse',
	'bit',
	'drive',
	'node',
	'core',
	'glide',
	'net',
	'droid',
	'wave',
	'matrix',
	'sphere',
	'giga',
	'hex',
	'rush',
	'byte',
	'spark',
	'zoid',
	'mind',
	'tronix'
]

function* createCombinations(prefix: string[], suffix: string[]): Generator<string> {
	let i = 0
	while (true) {
		for (let offset = 0; offset < prefix.length; offset++) {
			const prefixIndex = (offset + i) % prefix.length
			const suffixIndex = (offset + i) % suffix.length
			yield `${prefix[prefixIndex]}-${suffix[suffixIndex]}`
		}
		i++
	}
}

function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[array[i], array[j]] = [array[j], array[i]]
	}
	return array
}

const shuffledPrefix = shuffle(PREFIXES)
const shuffledSuffix = shuffle(SUFFIXES)
const combinations = createCombinations(shuffledPrefix, shuffledSuffix)

export const nameGenerator = () => combinations.next().value
