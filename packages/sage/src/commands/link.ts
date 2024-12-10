import { Command } from 'commander'
import { logger } from '../core/logger.js'
import path from 'path'
import { existsSync, readFileSync,  writeFileSync } from 'fs'

import { homedir } from 'os'

const command = new Command('link')
	.description(
		'Generate a Github action for continuous integrations'
	)
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

    const IS_GITPROJECT = existsSync(path.join(process.cwd(), '.git'));

    if(IS_GITPROJECT){
        createGitWorkflow()
    } else {
        logger.error('Please make sure this is a Github repository before executin this command.')
    }
   
}



async function createGitWorkflow(){
    // cannot use RoboPlaySession from Robo.
    const HOME_DIR = homedir();
    const ROBOPLAY_PATH = path.join(HOME_DIR, '.robo', 'roboplay', 'session.json');
    
    if(existsSync(ROBOPLAY_PATH)){
        try {
            const data = JSON.parse(readFileSync(ROBOPLAY_PATH, 'utf-8'))
            const project = data.linkedProjects[process.cwd()]
            const userToken = data.userToken;
            const projectData = {
                path: project,
                id: project.podId
            }
            const workflowFile = await generateWorkflowFile();
            writeFileSync(path.join(process.cwd(), '.github', 'workflows', 'ROBOPLAY_CI.yml'), workflowFile);
        } catch(e){
            logger.error(e)
        }

    } else {
        logger.error('Roboplay folder does not exist, please make sure it exists before running this command.')
    }
}


async function generateWorkflowFile(){
    return `
    name: 'ROBOPLAY_CI'
    on:
    push:
        branches:
        - main

    jobs:
    Templates:
        runs-on: ubuntu-latest
        steps:
        - name: Check out repo
            uses: actions/checkout@v4

        - uses: pnpm/action-setup@v4
            with:
            version: 8.6.11

        - name: Setup Node.js
            uses: actions/setup-node@v4
            with:
            cache: 'pnpm'
            node-version: 20
            registry-url: 'https://registry.npmjs.org'

        - name: Deploy bot
            run: npx robo deploy --token \${{ secrets.ROBOPLAY_USER_TOKEN }}
    `;
}