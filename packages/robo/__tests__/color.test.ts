import { describe, expect, jest, test } from '@jest/globals'

async function withFreshModule<T>(
	opts: {
		env?: Record<string, string | undefined>
		argv?: string[]
		platform?: NodeJS.Platform
	},
	fn: (mod: any) => Promise<T> | T
): Promise<T> {
	const oldEnv = process.env
	const oldArgv = process.argv
	const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform')

	// Clone env to avoid mutating shared reference
	const nextEnv: NodeJS.ProcessEnv = { ...oldEnv }
	if (opts.env) {
		for (const [k, v] of Object.entries(opts.env)) {
			if (v === undefined) delete nextEnv[k]
			else nextEnv[k] = String(v)
		}
	}

	process.env = nextEnv
	process.argv = opts.argv ?? ['node', 'jest']

	const exec = async (): Promise<T> => {
		jest.resetModules()
		let result!: T
		await jest.isolateModulesAsync(async () => {
			const mod = await import('../dist/core/color.js')
			result = await fn(mod)
		})
		return result
	}

	try {
		if (opts.platform) {
			Object.defineProperty(process, 'platform', { value: opts.platform })
			return await exec()
		}
		return await exec()
	} finally {
		// restore everything
		if (platformDesc) Object.defineProperty(process, 'platform', platformDesc)
		process.env = oldEnv
		process.argv = oldArgv
	}
}

const OPEN = (n: number) => `\u001b[${n}m`
const CLOSE = (n: number) => `\u001b[${n}m`
const OPEN_TRUE = (r: number, g: number, b: number) => `\u001b[38;2;${r};${g};${b}m`
const CLOSE_TRUE_WHITE = () => `\u001b[38;2;255;255;255m`

describe('isColorSupported (detection)', () => {
	test('disabled when NO_COLOR is set (overrides FORCE_COLOR)', async () => {
		await withFreshModule({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, argv: ['node', 'jest'] }, (mod) => {
			expect(mod.isColorSupported).toBe(false)
			expect(mod.red('x')).toBe('x')
		})
	})

	test('forced on via env FORCE_COLOR', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			expect(mod.isColorSupported).toBe(true)
			expect(mod.red('x')).toContain(OPEN(31))
			expect(mod.red('x')).toContain(CLOSE(39))
		})
	})

	test('forced off via --no-color argv', async () => {
		await withFreshModule({ argv: ['node', 'jest', '--no-color'] }, (mod) => {
			expect(mod.isColorSupported).toBe(false)
			expect(mod.blue('y')).toBe('y')
		})
	})

	test('forced on via --color argv', async () => {
		await withFreshModule({ argv: ['node', 'jest', '--color'], env: { NO_COLOR: undefined } }, (mod) => {
			expect(mod.isColorSupported).toBe(true)
			expect(mod.green('g')).toContain(OPEN(32))
		})
	})

	test("Windows enables colors when TERM is not 'dumb' (stdout TTY not required)", async () => {
		await withFreshModule({ env: { TERM: 'xterm-256color', NO_COLOR: undefined }, platform: 'win32' }, (mod) => {
			expect(mod.isColorSupported).toBe(true)
		})
	})

	test('Windows + dumb terminal does not enable colors', async () => {
		await withFreshModule({ env: { TERM: 'dumb' }, platform: 'win32' }, (mod) => {
			expect(mod.isColorSupported).toBe(false)
		})
	})

	test('CI enables colors when CI + known provider is set', async () => {
		await withFreshModule({ env: { CI: '1', GITHUB_ACTIONS: 'true', NO_COLOR: undefined } }, (mod) => {
			expect(mod.isColorSupported).toBe(true)
		})
	})
})

describe('named exports', () => {
	test('named exports exist and wrap correctly (sample)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			expect(mod.reset('r')).toBe(`${OPEN(0)}r${CLOSE(0)}`)
			expect(mod.bold('b')).toBe(`${OPEN(1)}b${CLOSE(22)}`)
			expect(mod.dim('d')).toBe(`${OPEN(2)}d${CLOSE(22)}`)
			expect(mod.italic('i')).toBe(`${OPEN(3)}i${CLOSE(23)}`)
			expect(mod.underline('u')).toBe(`${OPEN(4)}u${CLOSE(24)}`)
			expect(mod.inverse('v')).toBe(`${OPEN(7)}v${CLOSE(27)}`)
			expect(mod.hidden('h')).toBe(`${OPEN(8)}h${CLOSE(28)}`)
			expect(mod.strikethrough('s')).toBe(`${OPEN(9)}s${CLOSE(29)}`)
			expect(mod.red('x')).toBe(`${OPEN(31)}x${CLOSE(39)}`)
			expect(mod.bgBlue('x')).toBe(`${OPEN(44)}x${CLOSE(49)}`)
			expect(mod.cyanBright('x')).toBe(`${OPEN(96)}x${CLOSE(39)}`)
		})
	})

	test('gray equals blackBright (both code 90)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			expect(mod.gray('g')).toBe(mod.blackBright('g'))
		})
	})
})

describe('wrapping, nesting, and bleed prevention', () => {
	test('nested styles produce nested escapes and close correctly', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const styled = mod.bold(mod.red('X'))
			expect(styled.startsWith(OPEN(1))).toBe(true)
			expect(styled.includes(OPEN(31))).toBe(true)
			expect(styled.endsWith(CLOSE(22))).toBe(true)
			expect(styled).toContain(CLOSE(39))
		})
	})

	test('composeColors applies left-to-right like nested calls', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const composed = mod.composeColors(mod.bold, mod.yellow)
			const a = composed('hey')
			const b = mod.yellow(mod.bold('hey'))
			expect(a).toBe(b)
		})
	})

	test('empty string and undefined yield empty string (no escapes)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			expect(mod.red('')).toBe('')
			expect((mod.red as any)(undefined)).toBe('')

			// Works for a BG and a style too
			expect(mod.bgMagenta('')).toBe('')
			expect(mod.bold('')).toBe('')
		})
	})

	test('bleed prevention: internal close code is re-opened (bold/dim special-case)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const INNER_CLOSE = CLOSE(22)

			const s1 = mod.bold(`Hello${INNER_CLOSE}B`)
			expect(s1).toContain(`${CLOSE(22)}${OPEN(1)}`)
			expect(s1.endsWith(CLOSE(22))).toBe(true)

			const s2 = mod.dim(`Hello${INNER_CLOSE}Y`)
			expect(s2).toContain(`${CLOSE(22)}${OPEN(2)}`)
			expect(s2.endsWith(CLOSE(22))).toBe(true)
		})
	})
})

describe('hex() 24-bit foreground', () => {
	test('valid hex opens with 38;2;r;g;b and closes to truecolor white (not 39)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const orange = mod.hex('#FFA500')
			const s = orange('sun')
			expect(s.startsWith(OPEN_TRUE(255, 165, 0))).toBe(true)
			expect(s.endsWith(CLOSE_TRUE_WHITE())).toBe(true)
		})
	})

	test('invalid hex falls back to classic white (37/39)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const bad = mod.hex('#GGGGGG')
			const s = bad('oops')
			expect(s).toBe(`${OPEN(37)}oops${CLOSE(39)}`)
		})
	})

	test('3-digit short hex is invalid and falls back to classic white', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const shorty = mod.hex('#0FB')
			const s = shorty('k')
			expect(s).toBe(`${OPEN(37)}k${CLOSE(39)}`)
		})
	})
})

describe('createColors({ useColor }) palettes', () => {
	test('useColor: true yields working wrappers identical to named exports (sample)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const c = mod.createColors({ useColor: true })
			expect(c.red('x')).toBe(mod.red('x'))
			expect(c.bgCyan('x')).toBe(mod.bgCyan('x'))
			expect(c.underline('x')).toBe(mod.underline('x'))
			expect(c.whiteBright('w')).toBe(`${OPEN(97)}w${CLOSE(39)}`)
			expect(c.bgRedBright('R')).toBe(`${OPEN(101)}R${CLOSE(49)}`)
		})
	})

	test('useColor: false makes all wrappers identity', async () => {
		await withFreshModule({}, (mod) => {
			const none = mod.createColors({ useColor: false })
			const keys = Object.keys(mod.color)

			for (const k of keys) {
				const fn = (none as any)[k] as (s: string) => string
				expect(fn).toBeInstanceOf(Function)
				expect(fn('X')).toBe('X')
			}
		})
	})

	test('palettes are independent snapshots (not affected by current isColorSupported)', async () => {
		// First: force colors off and create a palette (identity)
		let identityPalette: any
		await withFreshModule({ env: { NO_COLOR: '1' } }, (mod) => {
			identityPalette = mod.createColors()
			expect(mod.isColorSupported).toBe(false)
			expect(identityPalette.red('x')).toBe('x')
		})

		// Then: force colors on in a new module context
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			expect(mod.isColorSupported).toBe(true)
			expect(identityPalette.red('x')).toBe('x')
			const colored = mod.createColors()
			expect(colored.red('x')).toBe(`${OPEN(31)}x${CLOSE(39)}`)
		})
	})
})

describe('end-to-end usage examples (smoke)', () => {
	test('compose and nest foreground/background/styles', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const warn = mod.composeColors(mod.bold, mod.yellow)
			const s = mod.bgBlack(warn('Heads up!'))
			expect(s.startsWith(OPEN(40))).toBe(true)
			expect(s).toContain(OPEN(1))
			expect(s).toContain(OPEN(33))
			expect(s).toContain(CLOSE(39))
			expect(s.endsWith(CLOSE(49))).toBe(true)
		})
	})

	test('truecolor + reset interplay (documenting current behavior)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const orange = mod.hex('#FFA500')
			const s = orange('hi')
			const cleared = s + mod.reset(' ')
			expect(cleared.endsWith(CLOSE(0))).toBe(true)
		})
	})
})

describe('chainable API', () => {
	test('color.red.bold("X") equals bold(red("X")) and nests/close order is correct', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const chained = (mod.color as any).red.bold('X')
			const nested = mod.bold(mod.red('X'))

			expect(chained).toBe(nested)
			expect(chained.startsWith(OPEN(1))).toBe(true)
			expect(chained).toContain(OPEN(31))
			expect(chained).toContain(CLOSE(39))
			expect(chained.endsWith(CLOSE(22))).toBe(true)
		})
	})

	test('ordering: foreground outermost vs background outermost', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const fgOuter = (mod.color as any).bgBlue.bold.yellow('t')
			expect(fgOuter).toContain(OPEN(44))
			expect(fgOuter).toContain(OPEN(1))
			expect(fgOuter).toContain(OPEN(33))
			expect(fgOuter).toContain(CLOSE(49))
			expect(fgOuter.endsWith(CLOSE(39))).toBe(true)

			const bgOuter = (mod.color as any).yellow.bold.bgBlue('t')
			expect(bgOuter.startsWith(OPEN(44))).toBe(true)
			expect(bgOuter).toContain(OPEN(1))
			expect(bgOuter).toContain(OPEN(33))
			expect(bgOuter).toContain(CLOSE(39))
			expect(bgOuter.endsWith(CLOSE(49))).toBe(true)
		})
	})

	test('bleed prevention works with chained styles (bold/dim special-case)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const INNER_CLOSE = CLOSE(22)

			const sBold = (mod.color as any).red.bold(`Hello${INNER_CLOSE}B`)
			expect(sBold).toContain(`${CLOSE(22)}${OPEN(1)}`)
			expect(sBold.endsWith(CLOSE(22))).toBe(true)

			const sDim = (mod.color as any).yellow.dim(`Hello${INNER_CLOSE}Y`)
			expect(sDim).toContain(`${CLOSE(22)}${OPEN(2)}`)
			expect(sDim.endsWith(CLOSE(22))).toBe(true)
		})
	})

	test('chained call objects are reusable (no one-shot side effects)', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			const warn = (mod.color as any).yellow.bold
			expect(typeof warn).toBe('function')

			const a = warn('A')
			const b = warn('B')

			expect(a.startsWith(OPEN(1)) || a.startsWith(OPEN(33))).toBe(true)
			expect(a).toContain(OPEN(33))
			expect(a).toContain(OPEN(1))
			expect(a).toContain(CLOSE(39))
			expect(a.endsWith(CLOSE(22))).toBe(true)

			expect(b.startsWith(OPEN(1)) || b.startsWith(OPEN(33))).toBe(true)
			expect(b).toContain(OPEN(33))
			expect(b).toContain(OPEN(1))
			expect(b).toContain(CLOSE(39))
			expect(b.endsWith(CLOSE(22))).toBe(true)
		})
	})

	test('empty input yields empty output with chained calls', async () => {
		await withFreshModule({ env: { FORCE_COLOR: '1', NO_COLOR: undefined } }, (mod) => {
			expect((mod.color as any).red.bold('')).toBe('')
			expect((mod.color as any).bgMagenta.underline('')).toBe('')
			expect(((mod.color as any).yellow as (x: any) => string)(undefined)).toBe('')
		})
	})
})
