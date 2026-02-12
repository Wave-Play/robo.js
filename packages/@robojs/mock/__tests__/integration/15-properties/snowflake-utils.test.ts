/**
 * Snowflake Utilities Tests
 *
 * Tests for Discord.js SnowflakeUtil class - generating and deconstructing snowflakes.
 */
import { SnowflakeUtil } from 'discord.js'

describe('Snowflake Utilities', () => {
	it('should generate valid snowflake', () => {
		const snowflake = SnowflakeUtil.generate()

		// SnowflakeUtil.generate() returns bigint in discord.js v14
		expect(typeof snowflake).toBe('bigint')
		expect(String(snowflake)).toMatch(/^\d{17,19}$/)
	})

	it('should generate snowflake with timestamp', () => {
		const timestamp = Date.now()
		const snowflake = SnowflakeUtil.generate({ timestamp })

		const extracted = SnowflakeUtil.timestampFrom(snowflake)

		// Should be within 1 second
		expect(Math.abs(extracted - timestamp)).toBeLessThan(1000)
	})

	it('should extract timestamp from snowflake', () => {
		const snowflake = SnowflakeUtil.generate()
		const timestamp = SnowflakeUtil.timestampFrom(snowflake)

		expect(timestamp).toBeGreaterThan(0)
		expect(timestamp).toBeLessThanOrEqual(Date.now())
	})

	it('should deconstruct snowflake', () => {
		const snowflake = SnowflakeUtil.generate()
		const deconstructed = SnowflakeUtil.deconstruct(snowflake)

		expect(deconstructed.timestamp).toBeGreaterThan(0)
		expect(deconstructed.workerId).toBeGreaterThanOrEqual(0n)
		expect(deconstructed.processId).toBeGreaterThanOrEqual(0n)
		expect(deconstructed.increment).toBeGreaterThanOrEqual(0n)
	})

	it('should compare snowflakes by age', () => {
		const older = SnowflakeUtil.generate({ timestamp: Date.now() - 10000 })
		const newer = SnowflakeUtil.generate({ timestamp: Date.now() })

		const olderTs = SnowflakeUtil.timestampFrom(older)
		const newerTs = SnowflakeUtil.timestampFrom(newer)

		expect(olderTs).toBeLessThan(newerTs)
	})
})
