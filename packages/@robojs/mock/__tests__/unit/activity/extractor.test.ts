/**
 * Tests for the schema extraction logic.
 *
 * Uses mock filesystem structures to test extraction strategies
 * without requiring the actual SDK to be installed.
 */

import { extractEnumValues, ExtractorError } from '../../../src/activity/schema/extractor.js'

describe('Schema Extractor', () => {
	// ========================================================================
	// Enum Parsing
	// ========================================================================

	describe('extractEnumValues', () => {
		test('parses Commands enum from d.ts file', () => {
			const content = `
export declare enum Commands {
    AUTHORIZE = "AUTHORIZE",
    AUTHENTICATE = "AUTHENTICATE",
    GET_GUILDS = "GET_GUILDS",
    GET_GUILD = "GET_GUILD",
    GET_CHANNEL = "GET_CHANNEL"
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual(['AUTHORIZE', 'AUTHENTICATE', 'GET_GUILDS', 'GET_GUILD', 'GET_CHANNEL'])
		})

		test('parses Events enum from d.ts file', () => {
			const content = `
export declare enum Events {
    READY = "READY",
    VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE",
    SPEAKING_START = "SPEAKING_START",
    SPEAKING_STOP = "SPEAKING_STOP"
}
`
			const values = extractEnumValues(content, 'Events')
			expect(values).toEqual(['READY', 'VOICE_STATE_UPDATE', 'SPEAKING_START', 'SPEAKING_STOP'])
		})

		test('parses enum from source .ts file (non-declare)', () => {
			const content = `
export enum Commands {
    AUTHORIZE = "AUTHORIZE",
    AUTHENTICATE = "AUTHENTICATE"
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual(['AUTHORIZE', 'AUTHENTICATE'])
		})

		test('parses enum with single-quoted values', () => {
			const content = `
export declare enum Commands {
    AUTHORIZE = 'AUTHORIZE',
    AUTHENTICATE = 'AUTHENTICATE'
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual(['AUTHORIZE', 'AUTHENTICATE'])
		})

		test('handles empty enum', () => {
			const content = `
export declare enum Commands {
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual([])
		})

		test('returns empty array for missing enum', () => {
			const content = `
export declare enum SomeOtherEnum {
    FOO = "FOO"
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual([])
		})

		test('handles enum with comments and whitespace', () => {
			const content = `
export declare enum Commands {
    // Authentication
    AUTHORIZE = "AUTHORIZE",
    AUTHENTICATE = "AUTHENTICATE",

    // Guild operations
    GET_GUILDS = "GET_GUILDS"
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual(['AUTHORIZE', 'AUTHENTICATE', 'GET_GUILDS'])
		})

		test('handles file with multiple enums', () => {
			const content = `
export declare enum Commands {
    AUTHORIZE = "AUTHORIZE",
    AUTHENTICATE = "AUTHENTICATE"
}

export declare enum Events {
    READY = "READY",
    VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE"
}
`
			const commandValues = extractEnumValues(content, 'Commands')
			expect(commandValues).toEqual(['AUTHORIZE', 'AUTHENTICATE'])

			const eventValues = extractEnumValues(content, 'Events')
			expect(eventValues).toEqual(['READY', 'VOICE_STATE_UPDATE'])
		})

		test('handles enum without export keyword', () => {
			const content = `
enum Commands {
    AUTHORIZE = "AUTHORIZE"
}
`
			const values = extractEnumValues(content, 'Commands')
			expect(values).toEqual(['AUTHORIZE'])
		})
	})

	// ========================================================================
	// ExtractorError
	// ========================================================================

	describe('ExtractorError', () => {
		test('creates error with code and message', () => {
			const error = new ExtractorError('SDK_NOT_FOUND', 'SDK not found')
			expect(error.code).toBe('SDK_NOT_FOUND')
			expect(error.message).toBe('SDK not found')
			expect(error.name).toBe('ExtractorError')
			expect(error.scannedPaths).toEqual([])
		})

		test('creates error with scanned paths', () => {
			const paths = ['/foo/bar', '/baz/qux']
			const error = new ExtractorError('COMMANDS_NOT_FOUND', 'Commands not found', paths)
			expect(error.scannedPaths).toEqual(paths)
		})

		test('is an instance of Error', () => {
			const error = new ExtractorError('SDK_NOT_FOUND', 'test')
			expect(error).toBeInstanceOf(Error)
		})
	})
})
