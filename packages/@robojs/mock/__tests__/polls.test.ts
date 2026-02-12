/**
 * Polls Tests
 * Tests for Discord's native poll feature in messages
 */
import { createSessionState, createDefaultGuildWithChannel, createMockPoll, createMockUser } from '../src/session/state.js'
import { mockMessageToAPIMessage } from '../src/discord/payloads.js'
import type { SessionState, MockPollConfig } from '../src/types/index.js'
import { PollLayoutType } from '../src/types/index.js'

describe('Polls', () => {
	describe('Poll creation', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create a message with a poll', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const pollConfig: MockPollConfig = {
				question: { text: 'What is your favorite color?' },
				answers: [
					{ poll_media: { text: 'Red' } },
					{ poll_media: { text: 'Blue' } },
					{ poll_media: { text: 'Green' } }
				],
				duration: 24, // 24 hours
				allow_multiselect: false
			}

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: pollConfig
			})

			expect(message.poll).toBeDefined()
			expect(message.poll?.question.text).toBe('What is your favorite color?')
			expect(message.poll?.answers).toHaveLength(3)
			expect(message.poll?.answers[0].answer_id).toBe(1)
			expect(message.poll?.answers[1].answer_id).toBe(2)
			expect(message.poll?.answers[2].answer_id).toBe(3)
			expect(message.poll?.allow_multiselect).toBe(false)
			expect(message.poll?.layout_type).toBe(PollLayoutType.Default)
			expect(message.poll?.expiry).toBeDefined()
			expect(message.poll?.results?.is_finalized).toBe(false)
		})

		it('should create a poll without expiry when duration is not provided', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const pollConfig: MockPollConfig = {
				question: { text: 'Pick one' },
				answers: [{ poll_media: { text: 'Option A' } }, { poll_media: { text: 'Option B' } }]
			}

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: pollConfig
			})

			expect(message.poll?.expiry).toBeNull()
		})

		it('should create a multiselect poll', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const pollConfig: MockPollConfig = {
				question: { text: 'Select your favorites' },
				answers: [
					{ poll_media: { text: 'Pizza' } },
					{ poll_media: { text: 'Burger' } },
					{ poll_media: { text: 'Salad' } }
				],
				allow_multiselect: true
			}

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: pollConfig
			})

			expect(message.poll?.allow_multiselect).toBe(true)
		})

		it('should include poll with emoji in answers', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const pollConfig: MockPollConfig = {
				question: { text: 'Rate this', emoji: { name: '⭐' } },
				answers: [
					{ poll_media: { text: 'Good', emoji: { name: '👍' } } },
					{ poll_media: { text: 'Bad', emoji: { name: '👎' } } }
				]
			}

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: pollConfig
			})

			expect(message.poll?.question.emoji?.name).toBe('⭐')
			expect(message.poll?.answers[0].poll_media.emoji?.name).toBe('👍')
		})
	})

	describe('Vote tracking', () => {
		let sessionState: SessionState
		let messageId: string
		let channelId: string
		let userId1: string
		let userId2: string

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})

			const guild = createDefaultGuildWithChannel(sessionState)
			channelId = guild.channels[0]

			// Create users
			const user1 = createMockUser({ username: 'User1' })
			const user2 = createMockUser({ username: 'User2' })
			sessionState.users.set(user1.id, user1)
			sessionState.users.set(user2.id, user2)
			userId1 = user1.id
			userId2 = user2.id

			// Create message with poll
			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: {
					question: { text: 'Test poll' },
					answers: [
						{ poll_media: { text: 'Option 1' } },
						{ poll_media: { text: 'Option 2' } },
						{ poll_media: { text: 'Option 3' } }
					],
					allow_multiselect: false
				}
			})
			messageId = message.id
		})

		it('should add a vote to a poll', () => {
			const result = sessionState.addPollVote(messageId, userId1, 1)
			expect(result).toBe(true)

			const message = sessionState.getMessage(messageId)
			expect(message?.poll?.results?.answer_counts[0].count).toBe(1)
		})

		it('should not allow duplicate votes for same answer', () => {
			sessionState.addPollVote(messageId, userId1, 1)
			const result = sessionState.addPollVote(messageId, userId1, 1)
			expect(result).toBe(false)

			const message = sessionState.getMessage(messageId)
			expect(message?.poll?.results?.answer_counts[0].count).toBe(1)
		})

		it('should replace vote in single-select poll', () => {
			sessionState.addPollVote(messageId, userId1, 1)
			const result = sessionState.addPollVote(messageId, userId1, 2)
			expect(result).toBe(true)

			const message = sessionState.getMessage(messageId)
			expect(message?.poll?.results?.answer_counts[0].count).toBe(0)
			expect(message?.poll?.results?.answer_counts[1].count).toBe(1)
		})

		it('should track votes from multiple users', () => {
			sessionState.addPollVote(messageId, userId1, 1)
			sessionState.addPollVote(messageId, userId2, 1)

			const message = sessionState.getMessage(messageId)
			expect(message?.poll?.results?.answer_counts[0].count).toBe(2)
		})

		it('should get voters for an answer', () => {
			sessionState.addPollVote(messageId, userId1, 1)
			sessionState.addPollVote(messageId, userId2, 1)

			const voters = sessionState.getPollVoters(messageId, 1)
			expect(voters).toHaveLength(2)
			expect(voters).toContain(userId1)
			expect(voters).toContain(userId2)
		})

		it('should return empty array for no votes', () => {
			const voters = sessionState.getPollVoters(messageId, 1)
			expect(voters).toHaveLength(0)
		})

		it('should get user votes for a poll', () => {
			sessionState.addPollVote(messageId, userId1, 2)
			const votes = sessionState.getUserPollVotes(messageId, userId1)
			expect(votes).toEqual([2])
		})
	})

	describe('Multiselect polls', () => {
		let sessionState: SessionState
		let messageId: string
		let userId: string

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const user = createMockUser({ username: 'TestUser' })
			sessionState.users.set(user.id, user)
			userId = user.id

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: {
					question: { text: 'Select all that apply' },
					answers: [
						{ poll_media: { text: 'A' } },
						{ poll_media: { text: 'B' } },
						{ poll_media: { text: 'C' } }
					],
					allow_multiselect: true
				}
			})
			messageId = message.id
		})

		it('should allow multiple votes in multiselect poll', () => {
			sessionState.addPollVote(messageId, userId, 1)
			sessionState.addPollVote(messageId, userId, 2)
			const result = sessionState.addPollVote(messageId, userId, 3)

			expect(result).toBe(true)

			const userVotes = sessionState.getUserPollVotes(messageId, userId)
			expect(userVotes).toEqual([1, 2, 3])
		})

		it('should remove a vote from multiselect poll', () => {
			sessionState.addPollVote(messageId, userId, 1)
			sessionState.addPollVote(messageId, userId, 2)

			const result = sessionState.removePollVote(messageId, userId, 1)
			expect(result).toBe(true)

			const userVotes = sessionState.getUserPollVotes(messageId, userId)
			expect(userVotes).toEqual([2])
		})

		it('should not remove vote if not voted', () => {
			const result = sessionState.removePollVote(messageId, userId, 1)
			expect(result).toBe(false)
		})
	})

	describe('Poll expiration', () => {
		let sessionState: SessionState
		let messageId: string

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: {
					question: { text: 'Test poll' },
					answers: [{ poll_media: { text: 'Yes' } }, { poll_media: { text: 'No' } }],
					duration: 1
				}
			})
			messageId = message.id
		})

		it('should manually expire a poll', () => {
			const result = sessionState.expirePoll(messageId)
			expect(result).toBe(true)

			const message = sessionState.getMessage(messageId)
			expect(message?.poll?.results?.is_finalized).toBe(true)
		})

		it('should not expire already finalized poll', () => {
			sessionState.expirePoll(messageId)
			const result = sessionState.expirePoll(messageId)
			expect(result).toBe(false)
		})

		it('should not allow votes on expired poll', () => {
			const user = createMockUser({ username: 'TestUser' })
			sessionState.users.set(user.id, user)

			sessionState.expirePoll(messageId)
			const result = sessionState.addPollVote(messageId, user.id, 1)
			expect(result).toBe(false)
		})

		it('should check and auto-expire polls', () => {
			// Get the message and set expiry to past
			const message = sessionState.getMessage(messageId)
			if (message?.poll) {
				const pastDate = new Date()
				pastDate.setHours(pastDate.getHours() - 1) // 1 hour ago
				message.poll.expiry = pastDate.toISOString()
			}

			const result = sessionState.checkPollExpiry(messageId)
			expect(result).toBe(true)
			expect(message?.poll?.results?.is_finalized).toBe(true)
		})

		it('should not auto-expire poll before expiry time', () => {
			// Expiry is set 1 hour in the future by default (duration: 1)
			const result = sessionState.checkPollExpiry(messageId)
			expect(result).toBe(false)

			const message = sessionState.getMessage(messageId)
			expect(message?.poll?.results?.is_finalized).toBe(false)
		})
	})

	describe('Poll serialization', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should include poll in API message format', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: {
					question: { text: 'API test' },
					answers: [{ poll_media: { text: 'Choice 1' } }]
				}
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)
			const poll = (apiMessage as unknown as { poll: unknown }).poll

			expect(poll).toBeDefined()
		})
	})

	describe('createMockPoll helper', () => {
		it('should create a poll with all options', () => {
			const config: MockPollConfig = {
				question: { text: 'Test question' },
				answers: [{ poll_media: { text: 'Answer 1' } }, { poll_media: { text: 'Answer 2' } }],
				duration: 24,
				allow_multiselect: true,
				layout_type: PollLayoutType.Default
			}

			const poll = createMockPoll(config)

			expect(poll.question.text).toBe('Test question')
			expect(poll.answers).toHaveLength(2)
			expect(poll.answers[0].answer_id).toBe(1)
			expect(poll.answers[1].answer_id).toBe(2)
			expect(poll.allow_multiselect).toBe(true)
			expect(poll.layout_type).toBe(PollLayoutType.Default)
			expect(poll.expiry).toBeDefined()
			expect(poll.results).toBeDefined()
			expect(poll.results?.is_finalized).toBe(false)
		})

		it('should initialize vote counts to zero', () => {
			const config: MockPollConfig = {
				question: { text: 'Test' },
				answers: [{ poll_media: { text: 'A' } }, { poll_media: { text: 'B' } }, { poll_media: { text: 'C' } }]
			}

			const poll = createMockPoll(config)

			expect(poll.results?.answer_counts).toHaveLength(3)
			expect(poll.results?.answer_counts[0].count).toBe(0)
			expect(poll.results?.answer_counts[1].count).toBe(0)
			expect(poll.results?.answer_counts[2].count).toBe(0)
		})

		it('should throw error for more than 10 answers', () => {
			const config: MockPollConfig = {
				question: { text: 'Too many answers' },
				answers: Array(11)
					.fill(null)
					.map((_, i) => ({ poll_media: { text: `Option ${i + 1}` } }))
			}

			expect(() => createMockPoll(config)).toThrow('Poll cannot have more than 10 answers')
		})

		it('should throw error for zero answers', () => {
			const config: MockPollConfig = {
				question: { text: 'No answers' },
				answers: []
			}

			expect(() => createMockPoll(config)).toThrow('Poll must have at least 1 answer')
		})

		it('should allow exactly 10 answers', () => {
			const config: MockPollConfig = {
				question: { text: 'Max answers' },
				answers: Array(10)
					.fill(null)
					.map((_, i) => ({ poll_media: { text: `Option ${i + 1}` } }))
			}

			const poll = createMockPoll(config)
			expect(poll.answers).toHaveLength(10)
		})

		it('should throw error for question text exceeding 300 characters', () => {
			const config: MockPollConfig = {
				question: { text: 'A'.repeat(301) },
				answers: [{ poll_media: { text: 'Option 1' } }]
			}

			expect(() => createMockPoll(config)).toThrow('Poll question text cannot exceed 300 characters')
		})

		it('should allow question text of exactly 300 characters', () => {
			const config: MockPollConfig = {
				question: { text: 'A'.repeat(300) },
				answers: [{ poll_media: { text: 'Option 1' } }]
			}

			const poll = createMockPoll(config)
			expect(poll.question.text).toHaveLength(300)
		})

		it('should throw error for answer text exceeding 55 characters', () => {
			const config: MockPollConfig = {
				question: { text: 'Choose one' },
				answers: [
					{ poll_media: { text: 'A'.repeat(56) } }
				]
			}

			expect(() => createMockPoll(config)).toThrow('Poll answer 1 text cannot exceed 55 characters')
		})

		it('should allow answer text of exactly 55 characters', () => {
			const config: MockPollConfig = {
				question: { text: 'Choose one' },
				answers: [{ poll_media: { text: 'A'.repeat(55) } }]
			}

			const poll = createMockPoll(config)
			expect(poll.answers[0].poll_media.text).toHaveLength(55)
		})
	})

	describe('Invalid operations', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should not add vote to non-existent message', () => {
			const result = sessionState.addPollVote('fake-id', 'user-id', 1)
			expect(result).toBe(false)
		})

		it('should not add vote to message without poll', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'No poll here'
			})

			const result = sessionState.addPollVote(message.id, 'user-id', 1)
			expect(result).toBe(false)
		})

		it('should not add vote for invalid answer ID', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				poll: {
					question: { text: 'Test' },
					answers: [{ poll_media: { text: 'Only option' } }]
				}
			})

			const result = sessionState.addPollVote(message.id, 'user-id', 99)
			expect(result).toBe(false)
		})

		it('should not expire message without poll', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'No poll'
			})

			const result = sessionState.expirePoll(message.id)
			expect(result).toBe(false)
		})
	})
})
