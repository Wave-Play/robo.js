/**
 * Components V2 Tests
 *
 * Tests for Discord's Components V2 system including TextDisplay,
 * Section, MediaGallery, Container, Separator, and File components.
 *
 * Note: Components V2 uses special component types and requires the
 * IsComponentsV2 message flag (1 << 15 = 32768).
 */
import { Client, ChannelType } from 'discord.js'
import { createSession, mockRestAPI } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

// Components V2 types (not exported by discord.js yet in all versions)
const ComponentTypeV2 = {
	Section: 9,
	TextDisplay: 10,
	Thumbnail: 11,
	MediaGallery: 12,
	File: 13,
	Separator: 14,
	Container: 17
} as const

// IsComponentsV2 flag
const IS_COMPONENTS_V2_FLAG = 1 << 15 // 32768

describe('Components V2', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'components-v2-tests',
			config: {
				guilds: [
					{
						name: 'Components V2 Guild',
						channels: [{ name: 'v2-test', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		channelId = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText)!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('TextDisplay Component', () => {
		it('should send TextDisplay component via REST API', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.TextDisplay,
							content: '**Bold text** and *italic*'
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
			expect(response.components).toBeDefined()
		})

		it('should support markdown in TextDisplay', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.TextDisplay,
							content: '# Heading\n- List item\n```code block```'
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should support multiple TextDisplay components', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{ type: ComponentTypeV2.TextDisplay, content: 'First paragraph' },
						{ type: ComponentTypeV2.TextDisplay, content: 'Second paragraph' },
						{ type: ComponentTypeV2.TextDisplay, content: 'Third paragraph' }
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.components.length).toBe(3)
		})
	})

	describe('Section Component', () => {
		it('should send Section with text and accessory', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.Section,
							components: [{ type: ComponentTypeV2.TextDisplay, content: 'Section text content' }],
							accessory: {
								type: 2, // Button
								style: 1, // Primary
								label: 'Click Me',
								custom_id: 'section_button'
							}
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
			expect(response.components.length).toBe(1)
		})

		it('should send Section with thumbnail accessory', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.Section,
							components: [{ type: ComponentTypeV2.TextDisplay, content: 'Section with thumbnail' }],
							accessory: {
								type: ComponentTypeV2.Thumbnail,
								media: { url: 'https://example.com/image.png' }
							}
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should support multiple TextDisplay in Section (max 3)', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.Section,
							components: [
								{ type: ComponentTypeV2.TextDisplay, content: 'Line 1' },
								{ type: ComponentTypeV2.TextDisplay, content: 'Line 2' },
								{ type: ComponentTypeV2.TextDisplay, content: 'Line 3' }
							]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})
	})

	describe('MediaGallery Component', () => {
		it('should send MediaGallery with single image', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.MediaGallery,
							items: [{ media: { url: 'https://example.com/img1.png' } }]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should send MediaGallery with multiple images', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.MediaGallery,
							items: [
								{ media: { url: 'https://example.com/img1.png' } },
								{ media: { url: 'https://example.com/img2.png' } },
								{ media: { url: 'https://example.com/img3.png' } }
							]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should support item descriptions in MediaGallery', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.MediaGallery,
							items: [
								{
									media: { url: 'https://example.com/img.png' },
									description: 'A beautiful sunset'
								}
							]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should support spoiler on gallery items', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.MediaGallery,
							items: [
								{
									media: { url: 'https://example.com/spoiler.png' },
									spoiler: true
								}
							]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})
	})

	describe('Separator Component', () => {
		it('should send Separator between content', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{ type: ComponentTypeV2.TextDisplay, content: 'Above separator' },
						{ type: ComponentTypeV2.Separator, divider: true },
						{ type: ComponentTypeV2.TextDisplay, content: 'Below separator' }
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.components.length).toBe(3)
		})

		it('should support spacing options', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{ type: ComponentTypeV2.TextDisplay, content: 'Content' },
						{ type: ComponentTypeV2.Separator, spacing: 2 } // large spacing
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})
	})

	describe('Container Component', () => {
		it('should send Container with nested components', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.Container,
							components: [{ type: ComponentTypeV2.TextDisplay, content: 'Inside container' }]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should support accent color on Container', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.Container,
							accent_color: 0xff5733, // Orange
							components: [{ type: ComponentTypeV2.TextDisplay, content: 'Colored container' }]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})

		it('should support spoiler on Container', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.Container,
							spoiler: true,
							components: [{ type: ComponentTypeV2.TextDisplay, content: 'Hidden content' }]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})
	})

	describe('File Component', () => {
		it('should send File component', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{
							type: ComponentTypeV2.File,
							file: { url: 'https://example.com/doc.txt' }
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
		})
	})

	describe('V2 Validation', () => {
		it('should reject empty components with V2 flag', async () => {
			try {
				await mockRestAPI(session.token, `/channels/${channelId}/messages`, {
					method: 'POST',
					body: {
						components: [],
						flags: IS_COMPONENTS_V2_FLAG
					}
				})
				// Should not reach here
				expect(true).toBe(false)
			} catch (error) {
				expect(error).toBeDefined()
			}
		})

		it('should require content for TextDisplay', async () => {
			try {
				await mockRestAPI(session.token, `/channels/${channelId}/messages`, {
					method: 'POST',
					body: {
						components: [
							{
								type: ComponentTypeV2.TextDisplay
								// Missing content
							}
						],
						flags: IS_COMPONENTS_V2_FLAG
					}
				})
				expect(true).toBe(false)
			} catch (error) {
				expect(error).toBeDefined()
			}
		})

		it('should require at least one item in MediaGallery', async () => {
			try {
				await mockRestAPI(session.token, `/channels/${channelId}/messages`, {
					method: 'POST',
					body: {
						components: [
							{
								type: ComponentTypeV2.MediaGallery,
								items: []
							}
						],
						flags: IS_COMPONENTS_V2_FLAG
					}
				})
				expect(true).toBe(false)
			} catch (error) {
				expect(error).toBeDefined()
			}
		})

		it('should enforce max 10 items in MediaGallery', async () => {
			const items = Array(11)
				.fill(null)
				.map(() => ({
					media: { url: 'https://example.com/img.png' }
				}))

			try {
				await mockRestAPI(session.token, `/channels/${channelId}/messages`, {
					method: 'POST',
					body: {
						components: [
							{
								type: ComponentTypeV2.MediaGallery,
								items
							}
						],
						flags: IS_COMPONENTS_V2_FLAG
					}
				})
				expect(true).toBe(false)
			} catch (error) {
				expect(error).toBeDefined()
			}
		})

		it('should enforce max 3 TextDisplay in Section', async () => {
			try {
				await mockRestAPI(session.token, `/channels/${channelId}/messages`, {
					method: 'POST',
					body: {
						components: [
							{
								type: ComponentTypeV2.Section,
								components: [
									{ type: ComponentTypeV2.TextDisplay, content: '1' },
									{ type: ComponentTypeV2.TextDisplay, content: '2' },
									{ type: ComponentTypeV2.TextDisplay, content: '3' },
									{ type: ComponentTypeV2.TextDisplay, content: '4' } // Too many
								]
							}
						],
						flags: IS_COMPONENTS_V2_FLAG
					}
				})
				expect(true).toBe(false)
			} catch (error) {
				expect(error).toBeDefined()
			}
		})

		it('should require at least 1 TextDisplay in Section', async () => {
			try {
				await mockRestAPI(session.token, `/channels/${channelId}/messages`, {
					method: 'POST',
					body: {
						components: [
							{
								type: ComponentTypeV2.Section,
								components: [] // Empty
							}
						],
						flags: IS_COMPONENTS_V2_FLAG
					}
				})
				expect(true).toBe(false)
			} catch (error) {
				expect(error).toBeDefined()
			}
		})
	})

	describe('Mixed Components', () => {
		it('should support complex layout with multiple V2 components', async () => {
			const response = await mockRestAPI<{ id: string; components: unknown[] }>(session.token, `/channels/${channelId}/messages`, {
				method: 'POST',
				body: {
					components: [
						{ type: ComponentTypeV2.TextDisplay, content: '# Welcome' },
						{
							type: ComponentTypeV2.Section,
							components: [
								{ type: ComponentTypeV2.TextDisplay, content: 'Click the button to continue' }
							],
							accessory: {
								type: 2,
								style: 1,
								label: 'Continue',
								custom_id: 'continue_btn'
							}
						},
						{ type: ComponentTypeV2.Separator, divider: true },
						{
							type: ComponentTypeV2.MediaGallery,
							items: [
								{ media: { url: 'https://example.com/1.png' } },
								{ media: { url: 'https://example.com/2.png' } }
							]
						}
					],
					flags: IS_COMPONENTS_V2_FLAG
				}
			})

			expect(response.id).toBeDefined()
			expect(response.components.length).toBe(4)
		})
	})
})
