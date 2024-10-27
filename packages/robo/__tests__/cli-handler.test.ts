import { Command } from '../src/cli/utils/cli-handler'

describe('CLI Handler Tests', () => {
	it('should assign only a single argument to -k option', () => {
		const command = new Command('test-command')
		command.option('-k', '--kit', 'Test option')

		const args = ['-k', 'activity', 'myactivity']
		const { options, index } = command['parseOptions'](args)

		expect(options.kit).toBe('activity')
		const positionalArgs = args.slice(index)
		expect(positionalArgs).toEqual(['myactivity'])
	})

	it('should assign multiple arguments to --plugins option with separator', () => {
		const command = new Command('test-command')
		command.option('-p', '--plugins', 'Plugins option', true) // acceptsMultipleValues set to true

		const args = ['--plugins', '@robojs/ai', '@robojs/sync', '--', 'myactivity']
		const { options, index } = command['parseOptions'](args)

		expect(options.plugins).toEqual(['@robojs/ai', '@robojs/sync'])
		const positionalArgs = args.slice(index)
		expect(positionalArgs).toEqual(['myactivity'])
	})
})
