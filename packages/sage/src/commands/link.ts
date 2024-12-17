import { Command } from 'commander'
import { logger } from '../core/logger.js'
import path from 'path'
import { existsSync, writeFileSync } from 'fs'
import { isRoboProject } from '../core/utils.js'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

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
		logger.error('Please make sure this is a Github and a Robo project  before executing this command.')
	}
}

async function createGitWorkflow() {
	// cannot use RoboPlaySession from Robo.
	const HOME_DIR = homedir()
	const ROBOPLAY_PATH = path.join(HOME_DIR, '.robo', 'roboplay', 'session.json')

	if (existsSync(ROBOPLAY_PATH)) {
		try {
			const workflowPath = path.join(process.cwd(), '.github', 'workflows')

			if (!existsSync(workflowPath)) {
				mkdirSync(workflowPath, { recursive: true })
			}
			const workflowFile = await generateWorkflowFile()
			writeFileSync(path.join(workflowPath, 'ROBOPLAY_CI.yml'), workflowFile)
		} catch (e) {
			logger.error(e)
		}
	} else {
		logger.error('Roboplay folder does not exist, please make sure it exists before running this command.')
	}
}

async function generateWorkflowFile() {
	return `
name: 'ROBOPLAY_CI'
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
          ROBOPLAY_DATA: \${{ secrets.ROBOPLAY_DATA }}
        run: |
            ROBO_PATH="$HOME/.robo/roboplay"
            mkdir -p $ROBO_PATH
            SESSION="$ROBO_PATH/session.json"
            DECODED_DATA=$(echo "$ROBOPLAY_DATA" | base64 --decode)
            echo "$DECODED_DATA" > "$SESSION"

      - name: Deploy bot
        run: npm install && npx robo deploy
    `
}
