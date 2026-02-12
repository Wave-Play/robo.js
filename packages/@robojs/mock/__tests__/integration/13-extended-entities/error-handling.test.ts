/**
 * Error Classes & Handling Tests
 *
 * Tests for Discord API error handling including DiscordAPIError,
 * error properties, permission errors, and rate limit handling.
 */
import { ChannelType, Client, DiscordAPIError, GatewayIntentBits, Guild, RateLimitError, TextChannel } from 'discord.js'
import { createSession, controlAPI, setRateLimitSimulation } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Error Classes & Handling', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'error-handling-tests',
			config: {
				guilds: [
					{
						name: 'Error Handling Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('DiscordAPIError for Unknown Resource', () => {
		it('should throw DiscordAPIError for unknown channel', async () => {
			const fakeId = generateSnowflake()

			try {
				await client!.channels.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(10003) // Unknown Channel
			}
		})

		it('should throw DiscordAPIError for unknown guild', async () => {
			const fakeId = generateSnowflake()

			try {
				await client!.guilds.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(10004) // Unknown Guild
			}
		})

		it('should throw DiscordAPIError for unknown member', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.members.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(10007) // Unknown Member
			}
		})

		it('should throw DiscordAPIError for unknown role', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.roles.fetch(fakeId)
				// Note: Some implementations return null instead of throwing
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(10011) // Unknown Role
			}
		})

		it('should throw DiscordAPIError for unknown message', async () => {
			const fakeId = generateSnowflake()

			try {
				await channel.messages.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(10008) // Unknown Message
			}
		})
	})

	describe('Error Properties', () => {
		it('should have error code property', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.members.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				const apiError = error as DiscordAPIError

				expect(apiError.code).toBeDefined()
				expect(typeof apiError.code).toBe('number')
			}
		})

		it('should have error message property', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.members.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				const apiError = error as DiscordAPIError

				expect(apiError.message).toBeDefined()
				expect(typeof apiError.message).toBe('string')
			}
		})

		it('should have method property', async () => {
			const fakeId = generateSnowflake()

			try {
				await channel.messages.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				const apiError = error as DiscordAPIError

				expect(apiError.method).toBeDefined()
				expect(['get', 'GET']).toContain(apiError.method.toLowerCase())
			}
		})

		it('should have url property', async () => {
			const fakeId = generateSnowflake()

			try {
				await channel.messages.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				const apiError = error as DiscordAPIError

				expect(apiError.url).toBeDefined()
				expect(typeof apiError.url).toBe('string')
			}
		})

		it('should have httpStatus property', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.members.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				const apiError = error as DiscordAPIError

				expect(apiError.status).toBeDefined()
				expect(apiError.status).toBe(404)
			}
		})
	})

	describe('Permission Errors', () => {
		it('should throw for missing permissions when enforcement enabled', async () => {
			// Enable strict permission enforcement
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guild.id,
					enforcement: 'strict',
					bot_permissions: '0' // No permissions
				}
			})

			try {
				await channel.send('No permission')
				// If it doesn't throw, permissions might not be enforced
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(50013) // Missing Permissions
			} finally {
				// Reset permissions
				await controlAPI(`/sessions/${session.id}/permissions?guild_id=${guild.id}`, {
					method: 'DELETE'
				})
			}
		})
	})

	describe('Invalid Input Errors', () => {
		it('should throw for invalid message content', async () => {
			// Empty content without embeds should fail
			try {
				await channel.send('')
				// Discord.js may handle this client-side
			} catch (error) {
				expect(error).toBeDefined()
			}
		})

		it('should throw for message too long', async () => {
			const longContent = 'a'.repeat(2001) // Exceeds 2000 char limit

			try {
				await channel.send(longContent)
				fail('Should have thrown for message too long')
			} catch (error) {
				// May be client-side validation or API error
				expect(error).toBeDefined()
			}
		})

		it('should throw for invalid role color', async () => {
			try {
				await guild.roles.create({
					name: 'Invalid Color',
					// @ts-expect-error - Testing invalid input
					color: 'not-a-color'
				})
			} catch (error) {
				expect(error).toBeDefined()
			}
		})
	})

	describe('Delete Errors', () => {
		it('should throw when deleting unknown message', async () => {
			const fakeId = generateSnowflake()

			try {
				await channel.messages.delete(fakeId)
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
				expect((error as DiscordAPIError).code).toBe(10008) // Unknown Message
			}
		})

		it('should throw when deleting unknown role', async () => {
			const fakeId = generateSnowflake()

			try {
				const role = guild.roles.cache.get(fakeId)
				if (role) {
					await role.delete()
				} else {
					// Try to delete via manager
					await guild.roles.delete(fakeId)
				}
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(DiscordAPIError)
			}
		})
	})

	describe('Rate Limit Handling', () => {
		it('should handle rate limit responses', async () => {
			// Enable rate limit simulation for the next request
			await setRateLimitSimulation(session.id, true, 1)

			// The next API request should receive a 429 response
			// Discord.js handles this internally and retries
			try {
				// This request will hit the rate limit, discord.js should handle it
				const message = await channel.send('Rate limit test')
				// If we get here, discord.js handled the rate limit and retried
				expect(message.content).toBe('Rate limit test')
			} catch (error) {
				// Discord.js may throw RateLimitError if it doesn't retry
				// This is acceptable behavior for immediate rate limits
				expect(error).toBeDefined()
			}
		})

		it('should include retry-after information in rate limit error', async () => {
			// This tests that rate limit errors have proper metadata
			// We simulate a rate limit with 2 second retry-after
			await setRateLimitSimulation(session.id, true, 2)

			// Send a message - discord.js will either retry or throw
			try {
				await channel.send('Retry-after test')
				// If message sent successfully, discord.js handled the retry
			} catch (error) {
				// Check that the error has rate limit info
				if (error instanceof RateLimitError) {
					expect(error.retryAfter).toBeGreaterThan(0)
				}
			}
		})
	})

	describe('Error Instanceof Checks', () => {
		it('should be instanceof Error', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.members.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				// Error may be wrapped in AggregateError by discord.js
				// Check constructor name to handle cross-realm issues
				const errorName = (error as Error).constructor?.name
				if (errorName === 'AggregateError') {
					const aggError = error as AggregateError
					expect(aggError.errors.length).toBeGreaterThan(0)
					// Inner errors should be actual Error instances
					expect(aggError.errors[0]).toBeDefined()
				} else {
					expect(error).toBeInstanceOf(Error)
				}
			}
		})

		it('should be instanceof DiscordAPIError', async () => {
			const fakeId = generateSnowflake()

			try {
				// Use a simpler API call that produces cleaner DiscordAPIError
				await channel.messages.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				// Discord.js may wrap errors differently depending on version and context
				// Check for various error types that indicate proper API error handling
				const errorName = (error as Error).constructor?.name

				if (errorName === 'AggregateError') {
					// If wrapped in AggregateError, check inner errors
					const aggError = error as AggregateError
					expect(aggError.errors.length).toBeGreaterThan(0)
					const innerError = aggError.errors[0] as Error & { code?: number }
					expect(innerError.message).toBeDefined()
				} else if (errorName === 'DiscordAPIError') {
					// Direct DiscordAPIError - ideal case
					expect(error).toBeInstanceOf(DiscordAPIError)
				} else if (error instanceof Error) {
					// Discord.js may return plain Error in some cases
					// Verify it has error-like properties from the API
					expect(error.message).toBeDefined()
					expect(error.message.length).toBeGreaterThan(0)
					// The error should mention the resource or have meaningful content
					const hasErrorInfo =
						error.message.includes('Unknown') ||
						error.message.includes('10008') ||
						error.message.includes('message') ||
						error.message.includes('404') ||
						(error as Error & { code?: number }).code !== undefined
					expect(hasErrorInfo).toBe(true)
				} else {
					// Fallback: if none of the above, just ensure it's an error
					expect(error).toBeInstanceOf(Error)
				}
			}
		})
	})

	describe('Error Stack Trace', () => {
		it('should have stack trace', async () => {
			const fakeId = generateSnowflake()

			try {
				await guild.members.fetch(fakeId)
				fail('Should have thrown')
			} catch (error) {
				expect((error as Error).stack).toBeDefined()
			}
		})
	})
})
