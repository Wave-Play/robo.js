/**
 * Unit tests for MockLLMProvider
 */

import { MockLLMProvider, createMockLLMProvider, MockResponses } from '../../src/llm/MockLLMProvider.js'
import type { ChatRequest } from '../../src/types/llm.js'

describe('MockLLMProvider', () => {
	let provider: MockLLMProvider

	beforeEach(() => {
		provider = new MockLLMProvider()
	})

	describe('addResponse', () => {
		it('should queue responses', () => {
			provider.addResponse({ content: 'Response 1' })
			provider.addResponse({ content: 'Response 2' })

			// History should be empty until chat is called
			expect(provider.getCallHistory()).toEqual([])
		})

		it('should support tool calls in responses', () => {
			// MockResponse uses simplified toolCalls format
			provider.addResponse({
				content: '',
				toolCalls: [{ name: 'fs_read', arguments: { path: '/test.ts' } }]
			})

			// No error thrown
		})
	})

	describe('chat', () => {
		it('should return queued response', async () => {
			provider.addResponse({ content: 'Hello, world!' })

			const response = await provider.chat({
				messages: [{ role: 'user', content: 'Hi' }]
			})

			expect(response.content).toBe('Hello, world!')
		})

		it('should return responses in FIFO order', async () => {
			provider.addResponse({ content: 'First' })
			provider.addResponse({ content: 'Second' })
			provider.addResponse({ content: 'Third' })

			const r1 = await provider.chat({ messages: [] })
			const r2 = await provider.chat({ messages: [] })
			const r3 = await provider.chat({ messages: [] })

			expect(r1.content).toBe('First')
			expect(r2.content).toBe('Second')
			expect(r3.content).toBe('Third')
		})

		it('should throw when queue exhausted', async () => {
			await expect(provider.chat({ messages: [] })).rejects.toThrow(
				'MockLLMProvider: No response configured for call 0'
			)
		})

		it('should include tool calls in response', async () => {
			// MockResponse uses simplified toolCalls format
			provider.addResponse({
				content: 'Running tests',
				toolCalls: [{ name: 'terminal_run', arguments: { command: 'npm test' } }]
			})

			const response = await provider.chat({ messages: [] })

			expect(response.content).toBe('Running tests')
			expect(response.toolCalls).toHaveLength(1)
			expect(response.toolCalls?.[0].function.name).toBe('terminal_run')
		})

		it('should record call history', async () => {
			// Add responses so chat() doesn't throw
			provider.addResponse({ content: 'Answer 1' })
			provider.addResponse({ content: 'Answer 2' })

			const request1: ChatRequest = {
				messages: [{ role: 'user', content: 'First question' }]
			}
			const request2: ChatRequest = {
				messages: [{ role: 'user', content: 'Second question' }]
			}

			await provider.chat(request1)
			await provider.chat(request2)

			const history = provider.getCallHistory()
			expect(history).toHaveLength(2)
			expect(history[0]).toEqual(request1)
			expect(history[1]).toEqual(request2)
		})
	})

	describe('stream', () => {
		it('should stream content in chunks', async () => {
			provider.addResponse({ content: 'Hello, world!' })

			const chunks: string[] = []
			for await (const chunk of provider.stream({ messages: [] })) {
				if (chunk.type === 'text' && chunk.text) {
					chunks.push(chunk.text)
				}
			}

			// Content should be streamed
			expect(chunks.length).toBeGreaterThan(0)
			expect(chunks.join('')).toBe('Hello, world!')
		})

		it('should stream tool calls', async () => {
			provider.addResponse({
				content: '',
				toolCalls: [{ name: 'fs_write', arguments: { path: '/test.ts', content: 'test' } }]
			})

			const toolNames: string[] = []
			for await (const chunk of provider.stream({ messages: [] })) {
				if (chunk.type === 'tool_call_start' && chunk.toolName) {
					toolNames.push(chunk.toolName)
				}
			}

			expect(toolNames).toHaveLength(1)
			expect(toolNames[0]).toBe('fs_write')
		})

		it('should emit done at end', async () => {
			provider.addResponse({ content: 'Test' })

			let gotDone = false
			for await (const chunk of provider.stream({ messages: [] })) {
				if (chunk.type === 'done') {
					gotDone = true
				}
			}

			expect(gotDone).toBe(true)
		})
	})

	describe('reset', () => {
		it('should clear response queue', async () => {
			provider.addResponse({ content: 'Should be cleared' })
			provider.reset()

			// Queue is empty after reset, so it should throw
			await expect(provider.chat({ messages: [] })).rejects.toThrow(
				'MockLLMProvider: No response configured for call 0'
			)
		})

		it('should clear call history', async () => {
			// Add a response so chat() doesn't throw
			provider.addResponse({ content: 'Answer' })
			await provider.chat({ messages: [{ role: 'user', content: 'test' }] })
			expect(provider.getCallHistory()).toHaveLength(1)

			provider.reset()
			expect(provider.getCallHistory()).toHaveLength(0)
		})
	})
})

describe('createMockLLMProvider', () => {
	it('should create a new instance', () => {
		const provider = createMockLLMProvider()
		expect(provider).toBeInstanceOf(MockLLMProvider)
	})
})

describe('MockResponses', () => {
	describe('simple', () => {
		it('should create a simple text response', () => {
			const response = MockResponses.simple('Hello')
			expect(response.content).toBe('Hello')
			expect(response.toolCalls).toBeUndefined()
		})
	})

	describe('withToolCalls', () => {
		it('should create a response with tool calls', () => {
			const calls = [{ name: 'fs_read', args: { path: '/test.ts' } }]

			const response = MockResponses.withToolCalls(calls)

			expect(response.content).toBe('')
			expect(response.toolCalls).toHaveLength(1)
			// MockResponse uses simplified format: { name, arguments }
			expect(response.toolCalls?.[0].name).toBe('fs_read')
		})

		it('should create multiple tool calls', () => {
			const calls = [
				{ name: 'fs_read', args: { path: '/a.ts' } },
				{ name: 'fs_read', args: { path: '/b.ts' } }
			]

			const response = MockResponses.withToolCalls(calls)

			expect(response.toolCalls).toHaveLength(2)
			expect(response.toolCalls?.[0].arguments.path).toBe('/a.ts')
			expect(response.toolCalls?.[1].arguments.path).toBe('/b.ts')
		})
	})

	describe('fsRead', () => {
		it('should create fs_read tool call', () => {
			const response = MockResponses.fsRead('/src/index.ts')

			expect(response.toolCalls).toHaveLength(1)
			// MockResponse uses simplified format
			expect(response.toolCalls?.[0].name).toBe('fs_read')
			expect(response.toolCalls?.[0].arguments.path).toBe('/src/index.ts')
		})
	})

	describe('fsWrite', () => {
		it('should create fs_write tool call', () => {
			const response = MockResponses.fsWrite('/test.ts', 'console.log("test")')

			expect(response.toolCalls).toHaveLength(1)
			// MockResponse uses simplified format
			expect(response.toolCalls?.[0].name).toBe('fs_write')
			expect(response.toolCalls?.[0].arguments.path).toBe('/test.ts')
			expect(response.toolCalls?.[0].arguments.content).toBe('console.log("test")')
		})
	})

	describe('terminalRun', () => {
		it('should create terminal_run tool call', () => {
			const response = MockResponses.terminalRun('npm', ['test'])

			expect(response.toolCalls).toHaveLength(1)
			// MockResponse uses simplified format
			expect(response.toolCalls?.[0].name).toBe('terminal_run')
			expect(response.toolCalls?.[0].arguments.command).toBe('npm')
			expect(response.toolCalls?.[0].arguments.args).toEqual(['test'])
		})
	})

	describe('done', () => {
		it('should create completion response', () => {
			const response = MockResponses.done('Task completed')

			expect(response.content).toBe('Task completed')
			expect(response.toolCalls).toBeUndefined()
		})
	})
})
