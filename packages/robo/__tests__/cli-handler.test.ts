import { Command } from '../src/cli/utils/cli-handler'

describe('CLI Handler Tests', () => {
	it('should assign only a single argument to -k option', () => {
		const command = new Command('test-command')
		command.option('-k', '--kit', 'Test option')

		const args = ['-k', 'activity', 'myactivity']
		const parsedOptions = command['parseOptions'](args)

		expect(parsedOptions.kit).toBe('activity')
		expect(args).toContain('myactivity')
	})
})
