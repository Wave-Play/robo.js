import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { CommandConfig } from 'robo.js'

const { clearFormatterCache } = await import('../.robo/build/core/formatter')
const { loadLocales } = await import('../.robo/build/core/utils')
const { t, tr, withLocale, createCommandConfig } = await import('../.robo/build/core/lib')

const writeJSON = (p: string, data: unknown) => {
	fs.mkdirSync(path.dirname(p), { recursive: true })
	fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

const deBidi = (s: string | string[]) => (Array.isArray(s) ? (s[0] ?? '') : s).replace(/\u2068|\u2069/g, '')

describe('@robojs/i18n – README usage', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-readme-'))
	const cwdOrig = process.cwd()
	const TS = new Date(Date.UTC(2020, 0, 2, 3, 4, 5)) // 2020-01-02T03:04:05Z

	beforeAll(() => {
		// Make time formatting deterministic-ish across environments
		process.env.TZ = 'UTC'

		process.chdir(tmp)

		// locales/en-US/app.json
		writeJSON(path.join(tmp, 'locales/en-US/app.json'), {
			hello: 'Hello {$name}!',
			'pets.count':
				'.input {$count :number}\n.match $count\n  one {{You have {$count} pet}}\n  *   {{You have {$count} pets}}',
			greetings: { hello: 'Hello {$name}!' },
			profile: 'Hi {$user.name}! You have {$stats.count :number} points.',
			ping: 'Pong!',
			'when.run': 'Ran at {$ts :time style=short} on {$ts :date style=medium}',
			'when.datetime': 'On {$ts :datetime dateStyle=medium timeStyle=short}',
			'last.seen': 'Last seen on {$user.lastSeen :date}'
		})

		// locales/es-ES/app.json
		writeJSON(path.join(tmp, 'locales/es-ES/app.json'), {
			hello: '¡Hola {$name}!',
			'pets.count':
				'.input {$count :number}\n.match $count\n  one {{Tienes {$count} mascota}}\n  *   {{Tienes {$count} mascotas}}',
			greetings: { hello: '¡Hola {$name}!' },
			profile: '¡Hola {$user.name}! Tienes {$stats.count :number} puntos.',
			ping: '¡Pong!',
			'when.run': 'Ejecutado a las {$ts :time style=short} el {$ts :date style=medium}',
			'when.datetime': 'El {$ts :datetime dateStyle=medium timeStyle=short}',
			'last.seen': 'Visto el {$user.lastSeen :date}'
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

		writeJSON(path.join(tmp, 'locales/en-US/shared/common.json'), {
			'ns.hello': 'NS Hello {$name}!',
			arr: ['One {$n :number}', 'Two']
		})
		writeJSON(path.join(tmp, 'locales/es-ES/shared/common.json'), {
			'ns.hello': '¡NS Hola {$name}!',
			arr: ['Uno {$n :number}', 'Dos']
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

	test('t(): formats :time and :date with a Date object', () => {
		const en = deBidi(t('en-US', 'app:when.run' as any, { ts: TS }))
		const es = deBidi(t('es-ES', 'app:when.run' as any, { ts: TS }))

		// English message framing
		expect(en).toMatch(/^Ran at /i)
		expect(en).toMatch(/ on /)
		// Year appears
		expect(en).toMatch(/2020/)

		// Spanish message framing
		expect(es).toMatch(/^Ejecutado a las /i)
		expect(es).toMatch(/ el /)
		// Year appears
		expect(es).toMatch(/2020/)
	})

	test('t(): formats :datetime with Date and with numeric epoch', () => {
		const enDate = deBidi(t('en-US', 'app:when.datetime' as any, { ts: TS }))
		const enEpoch = deBidi(t('en-US', 'app:when.datetime' as any, { ts: TS.getTime() }))

		expect(enDate).toContain('2020')
		expect(enEpoch).toContain('2020')
	})

	test('t(): nested Date param is flattened & formatted (:date)', () => {
		const en = deBidi(t('en-US', 'app:last.seen' as any, { user: { lastSeen: TS } }))
		const es = deBidi(t('es-ES', 'app:last.seen' as any, { user: { lastSeen: TS } }))

		expect(en).toMatch(/^Last seen on /)
		expect(en).toContain('2020')

		expect(es).toMatch(/^Visto el /)
		expect(es).toContain('2020')
	})

	test('tr(): formats message when params are required', () => {
		expect(deBidi(tr('en-US', 'app:hello' as any, { name: 'Pk' }))).toBe('Hello Pk!')
		expect(tr('es-ES', 'app:pets.count' as any, { count: 5 })).toBe('Tienes 5 mascotas')
	})

	test('tr(): allows omitting params for keys with no params', () => {
		expect(tr('en-US', 'app:ping' as any, {})).toBe('Pong!')
		expect(tr('es-ES', 'app:ping' as any, {})).toBe('¡Pong!')
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

	test('Nested namespace (string): shared/common:ns.hello', () => {
		expect(deBidi(t('en-US', 'shared/common:ns.hello' as any, { name: 'Robo' }))).toBe('NS Hello Robo!')
		expect(deBidi(t('es-ES', 'shared/common:ns.hello' as any, { name: 'Pk' }))).toBe('¡NS Hola Pk!')
	})

	test('Nested namespace (array): shared/common:arr', () => {
		const en = t('en-US', 'shared/common:arr' as any, { n: 7 })
		const es = t('es-ES', 'shared/common:arr' as any, { n: 3 })

		expect(Array.isArray(en)).toBe(true)
		expect(Array.isArray(es)).toBe(true)

		expect(en).toHaveLength(2)
		expect(es).toHaveLength(2)

		expect(deBidi(en[0]!)).toBe('One 7')
		expect(en[1]).toBe('Two')

		expect(deBidi(es[0]!)).toBe('Uno 3')
		expect(es[1]).toBe('Dos')
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

	test('createCommandConfig(): populates descriptions & localizations from keys', () => {
		const cfg = createCommandConfig({
			nameKey: 'commands:ping.name',
			descriptionKey: 'commands:ping.desc',
			options: [
				{
					type: 'string',
					name: 'text', // required by Robo.js & helps TS inference
					nameKey: 'commands:ping.arg.name',
					descriptionKey: 'commands:ping.arg.desc'
				}
			]
		} as const) as CommandConfig

		// Top-level description is resolved using defaultLocale (en-US)
		expect(cfg.description).toBe('Measure latency')
		// Localization map includes all discovered locales
		expect(cfg).toHaveProperty('descriptionLocalizations')
		expect(cfg.descriptionLocalizations).toEqual(
			expect.objectContaining({
				'en-US': 'Measure latency',
				'es-ES': 'Medir latencia'
			})
		)
		// The helper should strip descriptionKey at the top level
		expect('descriptionKey' in (cfg as any)).toBe(false)

		// Option defaults for the default locale (en-US)
		expect(cfg.options?.[0]?.name).toBe('text')
		expect(cfg.options?.[0]?.description).toBe('Optional text to include')

		// Option localizations derived from keys
		expect(cfg.options?.[0]?.nameLocalizations).toEqual(
			expect.objectContaining({
				'en-US': 'text',
				'es-ES': 'texto'
			})
		)
		expect(cfg.options?.[0]?.descriptionLocalizations).toEqual(
			expect.objectContaining({
				'en-US': 'Optional text to include',
				'es-ES': 'Texto opcional'
			})
		)

		// Option key fields should be stripped
		expect('nameKey' in (cfg.options?.[0] as any)).toBe(false)
		expect('descriptionKey' in (cfg.options?.[0] as any)).toBe(false)
	})
})
