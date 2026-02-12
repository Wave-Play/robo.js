/**
 * Forum & Media Channel Support Tests
 * Tests forum channel creation, tag management, and forum post operations
 */
import { ChannelType } from 'discord-api-types/v10'
import {
	MockServerState,
	createMockGuild,
	createMockChannel,
	createMockForumChannel
} from '../src/session/state.js'
import {
	mockForumChannelToAPIChannel,
	mockForumThreadToAPIChannel,
	mockForumTagToAPIForumTag,
	mockChannelToAPIChannel
} from '../src/discord/payloads.js'
import type { MockForumTag } from '../src/types/index.js'
import { ForumSortOrderType, ForumLayoutType } from '../src/types/index.js'

describe('Forum & Media Channels', () => {
	describe('createMockForumChannel', () => {
		it('should create a forum channel with default values', () => {
			const channel = createMockForumChannel()

			expect(channel.id).toBeDefined()
			expect(channel.name).toBe('forum')
			expect(channel.type).toBe(15) // GUILD_FORUM
			expect(channel.available_tags).toEqual([])
			expect(channel.default_auto_archive_duration).toBe(1440)
			expect(channel.default_sort_order).toBe(ForumSortOrderType.LatestActivity)
			expect(channel.default_forum_layout).toBe(ForumLayoutType.NotSet)
		})

		it('should create a media channel (type 16)', () => {
			const channel = createMockForumChannel({ type: 16 })

			expect(channel.type).toBe(16) // GUILD_MEDIA
			expect(channel.name).toBe('media')
		})

		it('should create channel with custom name and topic', () => {
			const channel = createMockForumChannel({
				name: 'help-forum',
				topic: 'Ask your questions here!'
			})

			expect(channel.name).toBe('help-forum')
			expect(channel.topic).toBe('Ask your questions here!')
		})

		it('should create channel with available tags', () => {
			const channel = createMockForumChannel({
				available_tags: [
					{ name: 'Bug', moderated: false, emoji_id: null, emoji_name: '🐛' },
					{ name: 'Feature', moderated: true, emoji_id: null, emoji_name: '✨' }
				]
			})

			expect(channel.available_tags).toHaveLength(2)
			expect(channel.available_tags[0].name).toBe('Bug')
			expect(channel.available_tags[0].moderated).toBe(false)
			expect(channel.available_tags[0].emoji_name).toBe('🐛')
			expect(channel.available_tags[0].id).toBeDefined() // ID should be generated
			expect(channel.available_tags[1].name).toBe('Feature')
			expect(channel.available_tags[1].moderated).toBe(true)
		})

		it('should use custom sort order and layout', () => {
			const channel = createMockForumChannel({
				default_sort_order: ForumSortOrderType.CreationDate,
				default_forum_layout: ForumLayoutType.GalleryView
			})

			expect(channel.default_sort_order).toBe(ForumSortOrderType.CreationDate)
			expect(channel.default_forum_layout).toBe(ForumLayoutType.GalleryView)
		})

		it('should set template field', () => {
			const channel = createMockForumChannel({
				template: '## Problem\n\n## Expected Behavior\n\n## Steps to Reproduce'
			})

			expect(channel.template).toBe('## Problem\n\n## Expected Behavior\n\n## Steps to Reproduce')
		})
	})

	describe('MockServerState forum operations', () => {
		let state: MockServerState
		let guildId: string

		beforeEach(() => {
			state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			state.addGuild(guild)
			guildId = guild.id
		})

		describe('isForumChannel', () => {
			it('should return true for forum channels', () => {
				const forum = state.createForumChannel({ guildId, type: 15 })
				expect(state.isForumChannel(forum.id)).toBe(true)
			})

			it('should return true for media channels', () => {
				const media = state.createForumChannel({ guildId, type: 16 })
				expect(state.isForumChannel(media.id)).toBe(true)
			})

			it('should return false for text channels', () => {
				const textChannel = createMockChannel({ type: 0 })
				state.addChannelToGuild(guildId, textChannel)
				expect(state.isForumChannel(textChannel.id)).toBe(false)
			})

			it('should return false for non-existent channels', () => {
				expect(state.isForumChannel('non-existent')).toBe(false)
			})
		})

		describe('getForumChannel', () => {
			it('should return forum channel', () => {
				const forum = state.createForumChannel({ guildId, name: 'help-forum' })
				const result = state.getForumChannel(forum.id)

				expect(result).toBeDefined()
				expect(result!.name).toBe('help-forum')
			})

			it('should return undefined for non-forum channels', () => {
				const textChannel = createMockChannel({ type: 0 })
				state.addChannelToGuild(guildId, textChannel)

				expect(state.getForumChannel(textChannel.id)).toBeUndefined()
			})
		})

		describe('createForumChannel', () => {
			it('should create forum channel and add to guild', () => {
				const forum = state.createForumChannel({
					guildId,
					name: 'support-forum'
				})

				const guild = state.getGuild(guildId)
				expect(guild!.channels).toContain(forum.id)
				expect(state.channels.has(forum.id)).toBe(true)
			})

			it('should set guild ID on channel', () => {
				const forum = state.createForumChannel({ guildId })
				expect(forum.guildId).toBe(guildId)
			})
		})

		describe('getForumChannelsForGuild', () => {
			it('should return all forum/media channels in guild', () => {
				state.createForumChannel({ guildId, type: 15, name: 'forum1' })
				state.createForumChannel({ guildId, type: 16, name: 'media1' })
				const textChannel = createMockChannel({ type: 0 })
				state.addChannelToGuild(guildId, textChannel)

				const forums = state.getForumChannelsForGuild(guildId)

				expect(forums).toHaveLength(2)
				expect(forums.map((f) => f.name).sort()).toEqual(['forum1', 'media1'])
			})
		})

		describe('tag management', () => {
			let forumId: string

			beforeEach(() => {
				const forum = state.createForumChannel({
					guildId,
					available_tags: [{ name: 'Existing', moderated: false, emoji_id: null, emoji_name: null }]
				})
				forumId = forum.id
			})

			describe('addForumTag', () => {
				it('should add a tag to forum channel', () => {
					const tag = state.addForumTag(forumId, {
						name: 'Bug',
						moderated: false,
						emoji_id: null,
						emoji_name: '🐛'
					})

					expect(tag).toBeDefined()
					expect(tag!.id).toBeDefined()
					expect(tag!.name).toBe('Bug')
					expect(tag!.emoji_name).toBe('🐛')

					const forum = state.getForumChannel(forumId)
					expect(forum!.available_tags).toHaveLength(2)
				})

				it('should return undefined if channel not found', () => {
					const tag = state.addForumTag('non-existent', {
						name: 'Tag',
						moderated: false,
						emoji_id: null,
						emoji_name: null
					})

					expect(tag).toBeUndefined()
				})

				it('should enforce max 20 tags limit', () => {
					// Add 19 more tags (already have 1)
					for (let i = 0; i < 19; i++) {
						state.addForumTag(forumId, {
							name: `Tag${i}`,
							moderated: false,
							emoji_id: null,
							emoji_name: null
						})
					}

					const forum = state.getForumChannel(forumId)
					expect(forum!.available_tags).toHaveLength(20)

					// 21st tag should fail
					const tag = state.addForumTag(forumId, {
						name: 'TooMany',
						moderated: false,
						emoji_id: null,
						emoji_name: null
					})

					expect(tag).toBeUndefined()
					expect(forum!.available_tags).toHaveLength(20)
				})

				it('should reject tag names over 20 characters', () => {
					const tag = state.addForumTag(forumId, {
						name: 'This name is way too long!',
						moderated: false,
						emoji_id: null,
						emoji_name: null
					})

					expect(tag).toBeUndefined()
				})
			})

			describe('removeForumTag', () => {
				it('should remove a tag from forum channel', () => {
					const forum = state.getForumChannel(forumId)!
					const existingTagId = forum.available_tags[0].id

					const result = state.removeForumTag(forumId, existingTagId)

					expect(result).toBe(true)
					expect(forum.available_tags).toHaveLength(0)
				})

				it('should return false for non-existent tag', () => {
					const result = state.removeForumTag(forumId, 'non-existent-tag')
					expect(result).toBe(false)
				})

				it('should return false for non-existent channel', () => {
					const result = state.removeForumTag('non-existent', 'tag-id')
					expect(result).toBe(false)
				})
			})

			describe('updateForumTag', () => {
				it('should update tag properties', () => {
					const forum = state.getForumChannel(forumId)!
					const existingTagId = forum.available_tags[0].id

					const updated = state.updateForumTag(forumId, existingTagId, {
						name: 'Updated',
						moderated: true,
						emoji_name: '✅'
					})

					expect(updated).toBeDefined()
					expect(updated!.name).toBe('Updated')
					expect(updated!.moderated).toBe(true)
					expect(updated!.emoji_name).toBe('✅')
				})

				it('should return undefined for invalid name length', () => {
					const forum = state.getForumChannel(forumId)!
					const existingTagId = forum.available_tags[0].id

					const updated = state.updateForumTag(forumId, existingTagId, {
						name: 'This name is way too long!'
					})

					expect(updated).toBeUndefined()
				})
			})
		})

		describe('forum post operations', () => {
			let forumId: string
			let tagId: string

			beforeEach(() => {
				const forum = state.createForumChannel({
					guildId,
					available_tags: [{ name: 'Help', moderated: false, emoji_id: null, emoji_name: '❓' }]
				})
				forumId = forum.id
				tagId = forum.available_tags[0].id
			})

			describe('createForumPost', () => {
				it('should create a forum post with initial message', () => {
					const { thread, message } = state.createForumPost({
						name: 'Help with TypeScript',
						parentId: forumId,
						message: {
							content: 'I need help with generics!'
						}
					})

					expect(thread).toBeDefined()
					expect(thread.name).toBe('Help with TypeScript')
					expect(thread.type).toBe(11) // PUBLIC_THREAD
					expect(thread.parentId).toBe(forumId)
					expect(thread.applied_tags).toEqual([])
					expect(thread.messageCount).toBe(1)
					expect(thread.lastMessageId).toBe(message.id)

					expect(message).toBeDefined()
					expect(message.content).toBe('I need help with generics!')
					expect(message.channelId).toBe(thread.id)
				})

				it('should create post with applied tags', () => {
					const { thread } = state.createForumPost({
						name: 'TypeScript Question',
						parentId: forumId,
						applied_tags: [tagId],
						message: { content: 'Question content' }
					})

					expect(thread.applied_tags).toEqual([tagId])
				})

				it('should add thread to guild channels', () => {
					const { thread } = state.createForumPost({
						name: 'New Post',
						parentId: forumId,
						message: { content: 'Post content' }
					})

					const guild = state.getGuild(guildId)!
					expect(guild.channels).toContain(thread.id)
				})

				it('should throw error for non-existent forum channel', () => {
					expect(() =>
						state.createForumPost({
							name: 'Test',
							parentId: 'non-existent',
							message: { content: 'Content' }
						})
					).toThrow('Forum channel not found')
				})

				it('should throw error for too many tags', () => {
					// Add more tags to forum
					for (let i = 0; i < 5; i++) {
						state.addForumTag(forumId, {
							name: `Tag${i}`,
							moderated: false,
							emoji_id: null,
							emoji_name: null
						})
					}

					const forum = state.getForumChannel(forumId)!
					const allTagIds = forum.available_tags.map((t) => t.id)

					expect(() =>
						state.createForumPost({
							name: 'Test',
							parentId: forumId,
							applied_tags: allTagIds, // 6 tags
							message: { content: 'Content' }
						})
					).toThrow('Forum posts can have at most 5 tags')
				})

				it('should throw error for invalid tag ID', () => {
					expect(() =>
						state.createForumPost({
							name: 'Test',
							parentId: forumId,
							applied_tags: ['invalid-tag-id'],
							message: { content: 'Content' }
						})
					).toThrow('Invalid tag ID')
				})
			})

			describe('isForumThread', () => {
				it('should return true for threads in forum channels', () => {
					const { thread } = state.createForumPost({
						name: 'Forum Post',
						parentId: forumId,
						message: { content: 'Content' }
					})

					expect(state.isForumThread(thread.id)).toBe(true)
				})

				it('should return false for regular threads', () => {
					const textChannel = createMockChannel({ type: 0 })
					state.addChannelToGuild(guildId, textChannel)

					const thread = state.createThread({
						name: 'Regular Thread',
						type: 11,
						parentId: textChannel.id
					})

					expect(state.isForumThread(thread.id)).toBe(false)
				})
			})

			describe('getForumThread', () => {
				it('should return forum thread with applied_tags', () => {
					const { thread: created } = state.createForumPost({
						name: 'Forum Post',
						parentId: forumId,
						applied_tags: [tagId],
						message: { content: 'Content' }
					})

					const thread = state.getForumThread(created.id)

					expect(thread).toBeDefined()
					expect(thread!.applied_tags).toEqual([tagId])
				})

				it('should return undefined for regular threads', () => {
					const textChannel = createMockChannel({ type: 0 })
					state.addChannelToGuild(guildId, textChannel)

					const thread = state.createThread({
						name: 'Regular Thread',
						type: 11,
						parentId: textChannel.id
					})

					expect(state.getForumThread(thread.id)).toBeUndefined()
				})
			})

			describe('updateForumThreadTags', () => {
				it('should update applied tags on forum thread', () => {
					const { thread } = state.createForumPost({
						name: 'Post',
						parentId: forumId,
						message: { content: 'Content' }
					})

					const updated = state.updateForumThreadTags(thread.id, [tagId])

					expect(updated).toBeDefined()
					expect(updated!.applied_tags).toEqual([tagId])
				})

				it('should return undefined for too many tags', () => {
					// Add more tags
					for (let i = 0; i < 5; i++) {
						state.addForumTag(forumId, {
							name: `Tag${i}`,
							moderated: false,
							emoji_id: null,
							emoji_name: null
						})
					}

					const { thread } = state.createForumPost({
						name: 'Post',
						parentId: forumId,
						message: { content: 'Content' }
					})

					const forum = state.getForumChannel(forumId)!
					const allTagIds = forum.available_tags.map((t) => t.id)

					const updated = state.updateForumThreadTags(thread.id, allTagIds)
					expect(updated).toBeUndefined()
				})
			})

			describe('getForumPosts', () => {
				it('should return all posts in a forum channel', () => {
					state.createForumPost({ name: 'Post 1', parentId: forumId, message: { content: 'A' } })
					state.createForumPost({ name: 'Post 2', parentId: forumId, message: { content: 'B' } })
					state.createForumPost({ name: 'Post 3', parentId: forumId, message: { content: 'C' } })

					const posts = state.getForumPosts(forumId)
					expect(posts).toHaveLength(3)
				})

				it('should filter by archived status', () => {
					const { thread } = state.createForumPost({
						name: 'Active Post',
						parentId: forumId,
						message: { content: 'Content' }
					})
					state.createForumPost({
						name: 'Another Post',
						parentId: forumId,
						message: { content: 'Content' }
					})

					// Archive one thread
					state.updateThread(thread.id, { archived: true })

					const activePosts = state.getForumPosts(forumId, { archived: false })
					const archivedPosts = state.getForumPosts(forumId, { archived: true })

					expect(activePosts).toHaveLength(1)
					expect(archivedPosts).toHaveLength(1)
				})
			})
		})
	})

	describe('Gateway payloads', () => {
		describe('mockForumTagToAPIForumTag', () => {
			it('should convert forum tag to API format', () => {
				const tag: MockForumTag = {
					id: '123',
					name: 'Bug',
					moderated: true,
					emoji_id: null,
					emoji_name: '🐛'
				}

				const result = mockForumTagToAPIForumTag(tag)

				expect(result).toEqual({
					id: '123',
					name: 'Bug',
					moderated: true,
					emoji_id: null,
					emoji_name: '🐛'
				})
			})
		})

		describe('mockForumChannelToAPIChannel', () => {
			it('should convert forum channel to API format', () => {
				const channel = createMockForumChannel({
					name: 'test-forum',
					topic: 'Forum description',
					available_tags: [{ name: 'Tag1', moderated: false, emoji_id: null, emoji_name: null }],
					default_sort_order: ForumSortOrderType.CreationDate,
					default_forum_layout: ForumLayoutType.ListView,
					template: 'Post template'
				})

				const result = mockForumChannelToAPIChannel(channel)

				expect(result.id).toBe(channel.id)
				expect(result.type).toBe(ChannelType.GuildForum)
				expect(result.name).toBe('test-forum')
				expect((result as any).topic).toBe('Forum description')
				expect((result as any).available_tags).toHaveLength(1)
				expect((result as any).default_sort_order).toBe(ForumSortOrderType.CreationDate)
				expect((result as any).default_forum_layout).toBe(ForumLayoutType.ListView)
				expect((result as any).template).toBe('Post template')
			})

			it('should be called by mockChannelToAPIChannel for forum types', () => {
				const channel = createMockForumChannel({ type: 15 })
				const result = mockChannelToAPIChannel(channel)

				expect(result.type).toBe(ChannelType.GuildForum)
				expect((result as any).available_tags).toBeDefined()
			})
		})

		describe('mockForumChannelToAPIChannel edge cases', () => {
			it('should handle forum channel with no tags', () => {
				const channel = createMockForumChannel({
					name: 'empty-forum',
					available_tags: []
				})

				const result = mockForumChannelToAPIChannel(channel)

				expect((result as any).available_tags).toEqual([])
			})

			it('should handle media channel (type 16)', () => {
				const channel = createMockForumChannel({
					type: 16,
					name: 'media-channel'
				})

				const result = mockForumChannelToAPIChannel(channel)

				expect(result.type).toBe(ChannelType.GuildMedia)
			})

			it('should include default_reaction_emoji when set', () => {
				const channel = createMockForumChannel({
					default_reaction_emoji: {
						emoji_id: '123456789',
						emoji_name: null
					}
				})

				const result = mockForumChannelToAPIChannel(channel)

				expect((result as any).default_reaction_emoji).toEqual({
					emoji_id: '123456789',
					emoji_name: null
				})
			})
		})

		describe('mockForumThreadToAPIChannel', () => {
			let state: MockServerState
			let forumId: string
			let tagId: string

			beforeEach(() => {
				state = new MockServerState()
				const guild = createMockGuild({ name: 'Test Guild' })
				state.addGuild(guild)
				const forum = state.createForumChannel({
					guildId: guild.id,
					available_tags: [{ name: 'Tag', moderated: false, emoji_id: null, emoji_name: null }]
				})
				forumId = forum.id
				tagId = forum.available_tags[0].id
			})

			it('should convert forum thread to API format with applied_tags', () => {
				const { thread } = state.createForumPost({
					name: 'Test Post',
					parentId: forumId,
					applied_tags: [tagId],
					message: { content: 'Content' }
				})

				const result = mockForumThreadToAPIChannel(thread)

				expect(result.id).toBe(thread.id)
				expect(result.type).toBe(ChannelType.PublicThread)
				expect(result.name).toBe('Test Post')
				expect((result as any).applied_tags).toEqual([tagId])
				expect((result as any).thread_metadata).toBeDefined()
			})

			it('should include message when provided', () => {
				const { thread, message } = state.createForumPost({
					name: 'Test Post',
					parentId: forumId,
					message: { content: 'Test content' }
				})

				const author = state.botUser
				const result = mockForumThreadToAPIChannel(thread, message, author)

				expect((result as any).message).toBeDefined()
				expect((result as any).message.content).toBe('Test content')
			})
		})
	})
})
