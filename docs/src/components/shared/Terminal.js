import { Select } from './Select'
import { useClipboard } from '../../hooks/use-clipboard'
import { usePackageManager } from '../../hooks/use-package-manager'
import { mdiConsoleLine, mdiContentCopy } from '@mdi/js'
import Icon from '@mdi/react'
import React from 'react'

const PackageManagers = [
	{ label: 'NPM', value: 'npm' },
	{ label: 'Yarn', value: 'yarn' },
	{ label: 'PNPM', value: 'pnpm' },
	{ label: 'Bun', value: 'bun' }
]

export const Terminal = (props) => {
	const { children, create, execute, install, title = 'Terminal' } = props
	const [copy] = useClipboard()
	const [packageManager, setPackageManager] = usePackageManager()
	const selectedManager = PackageManagers.find((item) => item.value === packageManager)
	let command = children
	if (typeof command === 'string') {
		command = command.trim()
	}

	let prefix = ''
	if (create) {
		prefix = getCreateCommand(selectedManager.value) + ' '
	} else if (execute) {
		prefix = getExecuteCommand(selectedManager.value) + ' '
	} else if (install && command) {
		prefix = getInstallCommand(selectedManager.value) + ' '
	} else if (install) {
		prefix = selectedManager.value + ' install'
	}

	const onClickCopy = () => {
		copy(prefix + command)
	}

	const onSelect = (option) => {
		console.log(option)
		setPackageManager(option.value)
	}

	return (
		<div className={'margin-bottom--lg terminal'}>
			<div className="terminal-header">
				<Icon path={mdiConsoleLine} size={'16px'} color={'rgb(161, 161, 161)'} />
				<span className="terminal-header-text">{title}</span>
				<div className="spacer" />
				<Select defaultValue={selectedManager} onSelect={onSelect} options={PackageManagers} />
				<button onClick={onClickCopy}>
					<Icon path={mdiContentCopy} size={'20px'} color={'rgb(161, 161, 161)'} />
				</button>
			</div>
			<pre className="prism-code language-bash codeBlock_node_modules-@docusaurus-theme-classic-lib-theme-CodeBlock-Content-styles-module thin-scrollbar terminal-bg">
				<code className="codeBlockLines_node_modules-@docusaurus-theme-classic-lib-theme-CodeBlock-Content-styles-module">
					<span className="token-line">
						{create || execute || install ? (
							<>
								<span className="token plain">{prefix}</span>
								<strong>
									<span className="token plain">{command}</span>
								</strong>
							</>
						) : (
							<span className="token plain">{command}</span>
						)}
					</span>
				</code>
			</pre>
		</div>
	)
}

function getCreateCommand(packageManager) {
	if (packageManager === 'npm') {
		return `npx create-robo`
	} else if (packageManager === 'yarn') {
		return `yarn create robo`
	} else if (packageManager === 'pnpm') {
		return `pnpm create robo`
	} else if (packageManager === 'bun') {
		return `bun create robo`
	}
}

function getExecuteCommand(packageManager) {
	if (packageManager === 'npm') {
		return `npx`
	} else if (packageManager === 'yarn') {
		return `yarn`
	} else if (packageManager === 'pnpm') {
		return `pnpm`
	} else if (packageManager === 'bun') {
		return `bun`
	}
}

function getInstallCommand(packageManager) {
	if (packageManager === 'npm') {
		return `npm install`
	} else if (packageManager === 'yarn') {
		return `yarn add`
	} else if (packageManager === 'pnpm') {
		return `pnpm add`
	} else if (packageManager === 'bun') {
		return `bun add`
	}
}
