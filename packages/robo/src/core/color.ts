/**
 * This was inspired by Colorette (MIT License)
 * https://github.com/jorgebucaran/colorette
 *
 * This is a simplified alternative with a Chalk-like API and minimal overhead.
 */
type RGB = { r: number; g: number; b: number }
export type Wrapper = (s: string) => string

export type Styler = Wrapper & { readonly [K in StyleName]: Styler }
export type ChainablePalette = { readonly [K in StyleName]: Styler }

const {
	env = {},
	argv = [],
	platform = '',
	stdout = {}
} = typeof process === 'undefined' ? ({} as unknown as NodeJS.Process) : process

const isDisabled = 'NO_COLOR' in env || argv.includes('--no-color')
const isForced = 'FORCE_COLOR' in env || argv.includes('--color')
const isWindows = platform === 'win32'
const isDumbTerminal = env.TERM === 'dumb'
const isCompatibleTerminal = Boolean(
	'isTTY' in stdout && (stdout as unknown as { isTTY?: boolean }).isTTY && env.TERM && !isDumbTerminal
)
const isCI = 'CI' in env && ('GITHUB_ACTIONS' in env || 'GITLAB_CI' in env || 'CIRCLECI' in env)

export const isColorSupported =
	!isDisabled && (isForced || (isWindows && !isDumbTerminal) || isCompatibleTerminal || isCI)

const openSeq = (n: number | RGB): string => (typeof n === 'object' ? `\x1b[38;2;${n.r};${n.g};${n.b}m` : `\x1b[${n}m`)

const closeSeq = (n: number | RGB): string => (typeof n === 'object' ? `\x1b[38;2;${n.r};${n.g};${n.b}m` : `\x1b[${n}m`)

const makeWrapper = (open: string, close: string, reopen?: string): Wrapper => {
	const at = open.length + 1
	const repl = reopen ?? open
	const clen = close.length

	function wrap(s: string): string {
		if (s == null || s === '') return ''
		const text = typeof s === 'string' ? s : String(s)
		const i = text.indexOf(close, at)
		if (i < 0) return open + text + close

		let idx = i,
			last = 0,
			out = ''
		while (idx >= 0) {
			out += text.slice(last, idx) + repl
			last = idx + clen
			idx = text.indexOf(close, last)
		}
		return open + out + text.slice(last) + close
	}
	return wrap
}

const init = (open: number | RGB, close: number | RGB, reopen?: string): Wrapper =>
	makeWrapper(openSeq(open), closeSeq(close), reopen)

const STYLE_CODES = {
	reset: [0, 0] as const,
	bold: [1, 22, '\x1b[22m\x1b[1m'] as const,
	dim: [2, 22, '\x1b[22m\x1b[2m'] as const,
	italic: [3, 23] as const,
	underline: [4, 24] as const,
	inverse: [7, 27] as const,
	hidden: [8, 28] as const,
	strikethrough: [9, 29] as const,

	black: [30, 39] as const,
	red: [31, 39] as const,
	green: [32, 39] as const,
	yellow: [33, 39] as const,
	blue: [34, 39] as const,
	magenta: [35, 39] as const,
	cyan: [36, 39] as const,
	white: [37, 39] as const,

	gray: [90, 39] as const,
	bgBlack: [40, 49] as const,
	bgRed: [41, 49] as const,
	bgGreen: [42, 49] as const,
	bgYellow: [43, 49] as const,
	bgBlue: [44, 49] as const,
	bgMagenta: [45, 49] as const,
	bgCyan: [46, 49] as const,
	bgWhite: [47, 49] as const,

	blackBright: [90, 39] as const,
	redBright: [91, 39] as const,
	greenBright: [92, 39] as const,
	yellowBright: [93, 39] as const,
	blueBright: [94, 39] as const,
	magentaBright: [95, 39] as const,
	cyanBright: [96, 39] as const,
	whiteBright: [97, 39] as const,

	bgBlackBright: [100, 49] as const,
	bgRedBright: [101, 49] as const,
	bgGreenBright: [102, 49] as const,
	bgYellowBright: [103, 49] as const,
	bgBlueBright: [104, 49] as const,
	bgMagentaBright: [105, 49] as const,
	bgCyanBright: [106, 49] as const,
	bgWhiteBright: [107, 49] as const
} as const

type StyleName = keyof typeof STYLE_CODES

const FAST_FUNCS: Record<StyleName, Wrapper> = Object.create(null)
const hasOwn = Object.prototype.hasOwnProperty

for (const k in STYLE_CODES) {
	if (!hasOwn.call(STYLE_CODES, k)) continue
	const [open, close, reopen] = STYLE_CODES[k as StyleName]
	FAST_FUNCS[k as StyleName] = init(open, close, reopen)
}

const hexToRgb = (hex: string): RGB | null => {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
	return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

const HEX_CACHE = new Map<string, Wrapper>()

export const hex = (h: string): Wrapper => {
	let fn = HEX_CACHE.get(h)
	if (fn) return fn

	const key = /[A-F]/.test(h) ? h.toLowerCase() : h
	fn = HEX_CACHE.get(key)
	if (!fn) {
		const rgb = hexToRgb(key)
		fn = rgb ? init(rgb, { r: 255, g: 255, b: 255 }) : FAST_FUNCS.white
		HEX_CACHE.set(key, fn)
	}
	if (key !== h) HEX_CACHE.set(h, fn)
	return fn
}

export const composeColors =
	(...fns: ReadonlyArray<Wrapper>): Wrapper =>
	(s: string) => {
		let out = s
		for (let i = 0; i < fns.length; i++) out = fns[i](out)
		return out
	}

type ChainProto = { readonly [K in StyleName]: Styler }
const IMPL = Symbol('impl')
type WithImpl = { [IMPL]: Wrapper }

const chainProto: ChainProto = Object.create(Function.prototype) as ChainProto

const makeChained = (prev: Wrapper, next: Wrapper): Styler => {
	const impl: Wrapper = (s) => next(prev(s))
	const fn = impl as unknown as Styler
	Object.defineProperty(fn, IMPL, { value: impl, enumerable: false })
	Object.setPrototypeOf(fn, chainProto)
	return fn
}

const makeChainHead = (base: Wrapper): Styler => {
	function self(s: string) {
		return base(s)
	}
	Object.defineProperty(self, IMPL, { value: base, enumerable: false })
	Object.setPrototypeOf(self, chainProto)
	return self as unknown as Styler
}

const defineChainGetter = (nm: StyleName) => {
	Object.defineProperty(chainProto, nm, {
		get(this: Styler & WithImpl): Styler {
			const own = Object.getOwnPropertyDescriptor(this, nm)
			if (own && 'value' in own) return own.value as Styler

			const chained = makeChained(this[IMPL], FAST_FUNCS[nm])
			Object.defineProperty(this, nm, {
				value: chained,
				writable: false,
				enumerable: false,
				configurable: false
			})
			return chained
		},
		enumerable: false,
		configurable: true
	})
}

for (const k in FAST_FUNCS) {
	if (!hasOwn.call(FAST_FUNCS, k)) continue
	defineChainGetter(k as StyleName)
}

export const color: ChainablePalette = (() => {
	const o: Record<StyleName, Styler> = Object.create(null)
	for (const k in FAST_FUNCS) {
		if (!hasOwn.call(FAST_FUNCS, k)) continue
		o[k as StyleName] = makeChainHead(FAST_FUNCS[k as StyleName])
	}
	return o as ChainablePalette
})()

export type ColorFunction = (s: string) => string
export type ColorFunctions = { readonly [K in StyleName]: ColorFunction }

interface CreateColorsOptions {
	useColor?: boolean
}

const ENABLED_FUNCS: ColorFunctions = FAST_FUNCS as unknown as ColorFunctions
const DISABLED_FUNCS: ColorFunctions = (() => {
	const id: ColorFunction = (s: string) => (s == null ? '' : typeof s === 'string' ? s : String(s))
	const map = Object.create(null) as Record<StyleName, ColorFunction>
	for (const k in FAST_FUNCS) if (hasOwn.call(FAST_FUNCS, k)) map[k as StyleName] = id
	return map as ColorFunctions
})()

export const createColors = ({ useColor = isColorSupported }: CreateColorsOptions = {}): ColorFunctions =>
	useColor ? ENABLED_FUNCS : DISABLED_FUNCS

export const {
	reset,
	bold,
	dim,
	italic,
	underline,
	inverse,
	hidden,
	strikethrough,
	black,
	red,
	green,
	yellow,
	blue,
	magenta,
	cyan,
	white,
	gray,
	bgBlack,
	bgRed,
	bgGreen,
	bgYellow,
	bgBlue,
	bgMagenta,
	bgCyan,
	bgWhite,
	blackBright,
	redBright,
	greenBright,
	yellowBright,
	blueBright,
	magentaBright,
	cyanBright,
	whiteBright,
	bgBlackBright,
	bgRedBright,
	bgGreenBright,
	bgYellowBright,
	bgBlueBright,
	bgMagentaBright,
	bgCyanBright,
	bgWhiteBright
} = createColors()
