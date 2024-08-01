import React, { useEffect, useRef, useState } from 'react'
import Layout from '@theme/Layout'
import sdk from '@stackblitz/sdk'
import styles from './playground.module.css'
import {useColorMode} from '@docusaurus/theme-common';

interface Project {
	categoryTitle: string,
	subCategory: Array<CategoryItems>,
}

interface CategoryItems {
	name: string,
	templates: Array<Templates>
	
}

interface Templates {
	title: string,
	desc: string,
	link: string
}

function Playground() {
	const [projectLink, setProjectLink] = useState('Wave-Play/robo.js/tree/main/templates/starter-app-js-react')
	const [dropdown, setDropdown] = useState(false)
	const [embedLoading, setEmbedLoading] = useState(true);
	const { colorMode } = useColorMode();
	const [fetchError, setFetchError] = useState<null | string>(null)
	const [templates, setTemplates] = useState<Project[] | null>(null);

	const embedDiv = useRef(null);
	const editor = useRef(null);

	useEffect(() => {

		const fetchTemplates = async () => {
			const res = await fetch('http://localhost:3001/api/templates');

			if(res.status !== 20){
				setFetchError(res.statusText);
			}

			if(res.ok && res.status === 200){
				const json = await res.json();
				setTemplates(json)	
			}


		}
		fetchTemplates();
	}, [])
	

	useEffect(() => {
		if(editor && editor.current){
			editor.current.setTheme(colorMode);
		}
	}, [colorMode])

	useEffect(() => {
		if(embedDiv && embedDiv.current){
			setEmbedLoading(true);
			sdk.embedGithubProject('embed', projectLink, {
				devToolsHeight: 40,
				showSidebar: true,
				terminalHeight: 40,
				theme: colorMode,
				view: 'default'
			}).then((v) => {
				setEmbedLoading(false)
				editor.current = v.editor
			});
		}
	}, [projectLink])


	function renderSearchBar(){
		if(!embedLoading){
			if(dropdown){
				return <SearchbarFocused data={templates} setProjectLink={setProjectLink} setDropdown={setDropdown} /> ;
			} else {
			return (<input className={styles.searchBar} onFocus={() => {
				if(fetchError !== null){
					setDropdown(true)
				}
		}} placeholder={fetchError !== null ? 'Search for a Robo template' : fetchError}></input>)
			}
		}
	}

	return (
	<>
	 <div className={styles.searchBarContainer} style={{height: dropdown ? '27px' : 'unset'}}>
		{renderSearchBar()}
	 </div>
	 <div ref={embedDiv} id='embed' /> 
	</>
	)
}


interface SearchBarProps {
	data: Project[] | null;
	setProjectLink: React.Dispatch<React.SetStateAction<string>>,
	setDropdown: React.Dispatch<React.SetStateAction<boolean>>
}

function SearchbarFocused(props: SearchBarProps){
	const { data, setProjectLink, setDropdown } = props;
	const [searchTemplate, setSearchTemplate] = useState('')

	const ResultsRender = () => {
		if(data !== null){
			return data.map((project: Project, idx: number) => {
				return project.subCategory.map((category: CategoryItems, idx: number) => {
					return category.templates.map((template: Templates) => {
						if(template.title.includes(searchTemplate)){
							return (<p onClick={() => {
								setProjectLink(template.link);
								setDropdown(false);
							}}>{template.title}</p>)
						}
						return <p>No results were found.</p>
					})
				})
			})
		}
		return 'An error happened while rendering the results.'
	}
	return (
		<div className={styles.searchBarFocusContainer}>
			<input 
			className={styles.searchBarFocus}
			onChange={(event) => setSearchTemplate(event.target.value)} 
			value={searchTemplate} 
			placeholder='Search for a Robo template'>
			</input>
			<div style={{overflowY: 'scroll'}}>
				{
					ResultsRender()
				}
			</div>
		</div>
	)
}


export default function Home() {
	return (
		<Layout title={`Playground`} description="Try out Robo.js in your browser!" >
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
