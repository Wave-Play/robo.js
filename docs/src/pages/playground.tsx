import React, { useEffect, useRef, useState } from 'react'
import Layout from '@theme/Layout'
import sdk from '@stackblitz/sdk'
import styles from './playground.module.css'
import { useColorMode } from '@docusaurus/theme-common'
import { usePluginData } from '@docusaurus/useGlobalData'

interface Project {
	categoryTitle: string
	subCategory: Array<CategoryItems>
}

interface CategoryItems {
	name: string
	templates: Template[]
}

interface Template {
	title: string
	desc: string
	link: string
	idx: number
}

const useRoboData = () => {
	const { env } = usePluginData('@robojs/docusaurus') as { env: { port: string } }

	return {
		hostRelative: process.env.NODE_ENV === 'development' ? 'http://localhost:' + env.port : ''
	}
}

function Playground() {
	const [projectLink, setProjectLink] = useState('Wave-Play/robo.js/tree/main/templates/starter-app-js-react')
	const [dropdown, setDropdown] = useState(false)
	const [embedLoading, setEmbedLoading] = useState(true)
	const { colorMode } = useColorMode()
	const [fetchError, setFetchError] = useState<null | string>(null)
	const [templates, setTemplates] = useState<Project[] | null>(null)
	const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0)
	const { hostRelative } = useRoboData()

	const embedDiv = useRef<HTMLIFrameElement | null>(null)
	const editor = useRef(null)

	useEffect(() => {
		const fetchTemplates = async () => {
			const res = await fetch(hostRelative + '/api/templates')

			if (res.status !== 20) {
				setFetchError(res.statusText)
			}

			if (res.ok && res.status === 200) {
				const json = await res.json()
				setTemplates(json)
			}
		}
		fetchTemplates()
	}, [])

	useEffect(() => {
		if (editor && editor.current) {
			editor.current.setTheme(colorMode)
		}
	}, [colorMode])

	const onClickDropdown = () => {
		if (dropdown) {
			setDropdown(false)
		}
	}

	useEffect(() => {
		document.addEventListener('click', onClickDropdown)

		return () => {
			document.removeEventListener('click', onClickDropdown)
		}
	}, [])

	useEffect(() => {
		if (embedDiv?.current) {
			sdk
				.embedGithubProject('embed', projectLink, {
					devToolsHeight: 40,
					showSidebar: true,
					terminalHeight: 40,
					theme: colorMode,
					view: 'default'
				})
				.then((v) => {
					setEmbedLoading(false)
					editor.current = v.editor
				})
		}
	}, [projectLink])

	return (
		<>
			<div className={styles.searchBarContainer} style={{ height: dropdown ? '47.5px' : 'unset' }}>
				{!embedLoading ? (
					<SearchBar
						data={templates}
						focus={dropdown}
						onFocus={() => {
							if (fetchError !== null) {
								setDropdown(true)
							}
						}}
						setProjectLink={setProjectLink}
						setDropdown={setDropdown}
						setSelectedTemplateIndex={setSelectedTemplateIndex}
						selectedTemplateIndex={selectedTemplateIndex}
					/>
				) : null}
			</div>
			<div ref={embedDiv} id="embed" onClick={onClickDropdown} />
		</>
	)
}

interface SearchBarProps {
	data: Project[] | null
	focus?: boolean
	onFocus?: () => void
	setProjectLink: React.Dispatch<React.SetStateAction<string>>
	setDropdown: React.Dispatch<React.SetStateAction<boolean>>
	selectedTemplateIndex: number
	setSelectedTemplateIndex: React.Dispatch<React.SetStateAction<number>>
}

function SearchBar(props: SearchBarProps) {
	const { data, focus, onFocus, setProjectLink, setDropdown, setSelectedTemplateIndex, selectedTemplateIndex } = props
	const { colorMode } = useColorMode()
	const [searchTemplate, setSearchTemplate] = useState('')
	const templates = data
		.map((project: Project) => project.subCategory)
		.flatMap((categories) => categories.flatMap((category) => category.templates))
		.filter((template) => template.title.includes(searchTemplate))

	return (
		<div className={focus ? styles.searchBarFocusContainer : styles.searchBarContainer}>
			<input
				className={focus ? styles.searchBarFocus : styles.searchBar}
				onChange={(event) => setSearchTemplate(event.target.value)}
				onFocus={onFocus}
				value={searchTemplate}
				placeholder={focus ? null : 'Search for a Robo template'}
			></input>
			{focus ? (
				<div style={{ overflowY: 'scroll' }}>
					{ searchTemplate.length > 0 && templates.length === 0 ? <ul>No results found</ul> : null }
					{ templates.map((template) => {
						const isSelected = template.idx === selectedTemplateIndex
						const title = template.title.replace('🔗', '').trim()

						return (
							<ul
								onClick={() => {
									setProjectLink(template.link)
									setDropdown(false)
									setSelectedTemplateIndex(template.idx)
								}}
								style={{
									backgroundColor: !isSelected ? null : colorMode === 'dark' ? '#3d4352' : '#e4e6f0'
								}}
							>
								{title}
							</ul>
						)
					})}
				</div>
			) : null}
		</div>
	)
}

export default function Home() {
	return (
		<Layout title={`Playground`} description="Try out Robo.js in your browser!">
			<main
				style={{
					width: '100%',
					height: 'calc(100vh - 64px)',
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					position: 'relative'
				}}
				className={styles.main}
			>
				<Playground />
			</main>
		</Layout>
	)
}
