/**
 * This was forked from Colorette (MIT License)
 * https://github.com/jorgebucaran/colorette
 *
 * It was done to minimize size and remove unnecessary features.
 */
import tty from 'node:tty'

const { env = {}, argv = [], platform = '' } = typeof process === 'undefined' ? {} : process

const isDisabled: boolean = 'NO_COLOR' in env || argv.includes('--no-color')
const isForced: boolean = 'FORCE_COLOR' in env || argv.includes('--color')
const isWindows: boolean = platform === 'win32'
const isDumbTerminal: boolean = env.TERM === 'dumb'

const isCompatibleTerminal: boolean = tty && tty.isatty && tty.isatty(1) && env.TERM && !isDumbTerminal

const isCI: boolean = 'CI' in env && ('GITHUB_ACTIONS' in env || 'GITLAB_CI' in env || 'CIRCLECI' in env)

export const isColorSupported: boolean =
	!isDisabled && (isForced || (isWindows && !isDumbTerminal) || isCompatibleTerminal || isCI)

const replaceClose = (
	index: number,
	string: string,
	close: string,
	replace: string,
	head: string = string.substring(0, index) + replace,
	tail: string = string.substring(index + close.length),
	next: number = tail.indexOf(close)
): string => head + (next < 0 ? tail : replaceClose(next, tail, close, replace))

const clearBleed = (index: number, string: string, open: string, close: string, replace: string): string =>
	index < 0 ? open + string + close : open + replaceClose(index, string, close, replace) + close

const filterEmpty =
	(open: string, close: string, replace: string = open, at: number = open.length + 1) =>
	(string: string): string =>
		string || !(string === '' || string === undefined)
			? clearBleed(('' + string).indexOf(close, at), string, open, close, replace)
			: ''

const hexToRgb = (hex: string) => {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)

	if (!match) {
		return null
	} else {
		return {
			r: parseInt(match[1], 16),
			g: parseInt(match[2], 16),
			b: parseInt(match[3], 16)
		}
	}
}

const init = (
	open: number | string | { r: number; g: number; b: number },
	close: number | string | { r: number; g: number; b: number },
	replace?: string
) => {
	const openStr =
		typeof open === 'object'
			? `\x1b[38;2;${open.r};${open.g};${open.b}m` // 24-bit color escape sequence
			: `\x1b[${open}m`

	const closeStr = typeof close === 'object' ? `\x1b[38;2;${close.r};${close.g};${close.b}m` : `\x1b[${close}m`

	return filterEmpty(openStr, closeStr, replace)
}

interface ColorFunctions {
	[key: string]: (string: string) => string
}

export const color: ColorFunctions = {
	reset: init(0, 0),
	bold: init(1, 22, '\x1b[22m\x1b[1m'),
	dim: init(2, 22, '\x1b[22m\x1b[2m'),
	italic: init(3, 23),
	underline: init(4, 24),
	inverse: init(7, 27),
	hidden: init(8, 28),
	strikethrough: init(9, 29),
	black: init(30, 39),
	red: init(31, 39),
	green: init(32, 39),
	yellow: init(33, 39),
	blue: init(34, 39),
	magenta: init(35, 39),
	cyan: init(36, 39),
	white: init(37, 39),
	gray: init(90, 39),
	bgBlack: init(40, 49),
	bgRed: init(41, 49),
	bgGreen: init(42, 49),
	bgYellow: init(43, 49),
	bgBlue: init(44, 49),
	bgMagenta: init(45, 49),
	bgCyan: init(46, 49),
	bgWhite: init(47, 49),
	blackBright: init(90, 39),
	redBright: init(91, 39),
	greenBright: init(92, 39),
	yellowBright: init(93, 39),
	blueBright: init(94, 39),
	magentaBright: init(95, 39),
	cyanBright: init(96, 39),
	whiteBright: init(97, 39),
	bgBlackBright: init(100, 49),
	bgRedBright: init(101, 49),
	bgGreenBright: init(102, 49),
	bgYellowBright: init(103, 49),
	bgBlueBright: init(104, 49),
	bgMagentaBright: init(105, 49),
	bgCyanBright: init(106, 49),
	bgWhiteBright: init(107, 49)
}

export function composeColors(...fns: ((s: string) => string)[]): (s: string) => string {
	return (s) => fns.reduce((acc, fn) => fn(acc), s)
}

export const hex = (hex: string) => {
	const rgb = hexToRgb(hex)
	return rgb ? init(rgb, { r: 255, g: 255, b: 255 }) : init(37, 39) // fall back to white if hex is invalid
}

interface CreateColorsOptions {
	useColor?: boolean
}

export const createColors = ({ useColor = isColorSupported }: CreateColorsOptions = {}): ColorFunctions =>
	useColor ? color : Object.keys(color).reduce((colors, key) => ({ ...colors, [key]: String }), {})

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
	cyanBright
} = createColors()
