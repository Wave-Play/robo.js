import { logger } from '../core/logger.js'
import { isRoboProject } from '../core/utils.js'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { Command } from 'commander'
import { color, composeColors } from 'robo.js'

const Highlight = composeColors(color.bold, color.cyan)

const command = new Command('link')
	.description('Generate a Github action for continuous integrations')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(linkAction)
export default command

interface LinkOptions {
	silent?: boolean
	verbose?: boolean
}

async function linkAction(options: LinkOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug(`CLI Options:`, options)

	const isGitProject = existsSync(path.join(process.cwd(), '.git'))
	const roboProject = isRoboProject()
	if (isGitProject && roboProject) {
		createGitWorkflow()
	} else {
		logger.error('Please make sure this is a Github and a Robo project before executing this command.')
	}
}

async function createGitWorkflow() {
	const HOME_DIR = homedir()

	// Make sure session exists
	if (!existsSync(path.join(HOME_DIR, '.robo', 'roboplay', 'session.json'))) {
		logger.error(`Please run ${Highlight('npx robo login')} before running this command.`)
		return
	}

	try {
		const workflowPath = path.join(process.cwd(), '.github', 'workflows')

		if (!existsSync(workflowPath)) {
			mkdirSync(workflowPath, { recursive: true })
		}
		const workflowFile = await generateWorkflowFile()
		writeFileSync(path.join(workflowPath, 'roboplay.yml'), workflowFile)
	} catch (e) {
		logger.error(e)
	}
}

async function generateWorkflowFile() {
	return `name: 'Deploy to RoboPlay'
on:
  push:
    branches:
    - main

jobs:
  GeneratedCIRoboFile:
      runs-on: ubuntu-latest
      steps:
      - name: Check out repo
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4

      - name: Create session File
        env:
          ROBOPLAY_SESSION: \${{ secrets.ROBOPLAY_SESSION }}
        run: |
            ROBO_PATH="$HOME/.robo/roboplay"
            mkdir -p $ROBO_PATH
            SESSION="$ROBO_PATH/session.json"
            DECODED_DATA=$(echo "$ROBOPLAY_SESSION" | base64 --decode)
            echo "$DECODED_DATA" > "$SESSION"

      - name: Deploy bot
        run: npm install && npx robo deploy
    `
}
