import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals'

await jest.unstable_mockModule('robo.js', () => {
	// Very small in-memory State impl
	const ns = new Map<string, Map<string, unknown>>()

	const State = {
		set(k: string, v: unknown, opts: { namespace: string }) {
			if (!ns.has(opts.namespace)) ns.set(opts.namespace, new Map())
			ns.get(opts.namespace)!.set(k, v)
		},
		get<T>(k: string, opts: { namespace: string }): T {
			return ns.get(opts.namespace)?.get(k) as T
		}
	}

	const createCommandConfig = <T>(cfg: T) => cfg
	const getPluginOptions = (_id: string) => ({ defaultLocale: 'en-US' })

	// 🔧 NEW: stub logger required by ./core/loggers.ts
	const logger = {
		child: () => logger,
		debug: (..._args: unknown[]) => {},
		info: (..._args: unknown[]) => {},
		warn: (..._args: unknown[]) => {},
		error: (..._args: unknown[]) => {},
		fork: () => logger
	}

	return { State, createCommandConfig, getPluginOptions, logger }
})

// After the mock above, import modules that depend on it
const { clearFormatterCache } = await import('../.robo/build/core/formatter')
const { loadLocales } = await import('../.robo/build/core/utils')
const { t, tr, withLocale, createCommandConfig } = await import('../.robo/build/core/lib')

const writeJSON = (p: string, data: unknown) => {
	fs.mkdirSync(path.dirname(p), { recursive: true })
	fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

const deBidi = (s: string) => s.replace(/\u2068|\u2069/g, '')

describe('@robojs/i18n – README usage', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-readme-'))
	const cwdOrig = process.cwd()

	beforeAll(() => {
		process.chdir(tmp)

		// locales/en-US/app.json
		writeJSON(path.join(tmp, 'locales/en-US/app.json'), {
			hello: 'Hello {$name}!',
			'pets.count':
				'.input {$count :number}\n.match $count\n  one {{You have {$count} pet}}\n  *   {{You have {$count} pets}}',
			greetings: { hello: 'Hello {$name}!' },
			profile: 'Hi {$user.name}! You have {$stats.count :number} points.'
		})

		// locales/es-ES/app.json
		writeJSON(path.join(tmp, 'locales/es-ES/app.json'), {
			hello: '¡Hola {$name}!',
			'pets.count':
				'.input {$count :number}\n.match $count\n  one {{Tienes {$count} mascota}}\n  *   {{Tienes {$count} mascotas}}',
			greetings: { hello: '¡Hola {$name}!' },
			profile: '¡Hola {$user.name}! Tienes {$stats.count :number} puntos.'
		})

		// locales/en-US/commands.json
		writeJSON(path.join(tmp, 'locales/en-US/commands.json'), {
			hey: 'Hey there, {$user.name}!',
			ping: {
				name: 'ping',
				desc: 'Measure latency',
				arg: { name: 'text', desc: 'Optional text to include' }
			}
		})

		// locales/es-ES/commands.json
		writeJSON(path.join(tmp, 'locales/es-ES/commands.json'), {
			hey: '¡Hola, {$user.name}!',
			ping: {
				name: 'ping',
				desc: 'Medir latencia',
				arg: { name: 'texto', desc: 'Texto opcional' }
			}
		})

		loadLocales()
	})

	afterAll(() => {
		process.chdir(cwdOrig)
	})

	test('t(): formats simple message', () => {
		expect(deBidi(t('en-US', 'app:hello' as any, { name: 'Robo' }))).toBe('Hello Robo!')
	})

	test('t(): formats plural/match (MF2) message', () => {
		expect(t('en-US', 'app:pets.count' as any, { count: 1 })).toBe('You have 1 pet')
		expect(t('en-US', 'app:pets.count' as any, { count: 3 })).toBe('You have 3 pets')
	})

	test('withLocale (loose): curried translator', () => {
		const t$ = withLocale('en-US')
		expect(deBidi(t$('app:hello' as any, { name: 'Robo' }))).toBe('Hello Robo!')
	})

	test('withLocale (strict): requires params when present', () => {
		const tr$ = withLocale('en-US', { strict: true })
		expect(deBidi(tr$('app:hello' as any, { name: 'Robo' }))).toBe('Hello Robo!')
		expect(tr$('app:pets.count' as any, { count: 2 })).toBe('You have 2 pets')
	})

	test('Nested keys: app:greetings.hello', () => {
		expect(deBidi(t('en-US', 'app:greetings.hello' as any, { name: 'Pk' }))).toBe('Hello Pk!')
	})

	test('Nested parameter objects: {$user.name} & {$stats.count :number}', () => {
		const res = t('en-US', 'app:profile' as any, {
			user: { name: 'Robo' },
			stats: { count: 42 }
		})
		expect(deBidi(res)).toBe('Hi Robo! You have 42 points.')
	})

	test('Cache: clearFormatterCache() retains correct behavior', () => {
		const a = t('en-US', 'app:hello' as any, { name: 'Cache' })
		clearFormatterCache()
		const b = t('en-US', 'app:hello' as any, { name: 'Cache' })
		expect(a).toBe(b)
	})

	test('Errors: missing locale', () => {
		expect(() => t({ locale: 'fr-FR' }, 'app:hello' as any, { name: 'X' })).toThrow('Locale "fr-FR" not found')
	})

	test('Errors: missing key', () => {
		expect(() => t('en-US', 'app:missing' as any)).toThrow(
			'Translation for key "app:missing" not found in locale "en-US"'
		)
	})
})
