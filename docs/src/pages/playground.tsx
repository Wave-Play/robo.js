import React, { useEffect, useRef, useState } from 'react'
import Layout from '@theme/Layout'
import sdk from '@stackblitz/sdk'
import styles from './playground.module.css'
import {useColorMode} from '@docusaurus/theme-common';

interface Project {
	name: string,
	link: string,
	openFile: string | undefined
}


function Playground() {
	const [projectIdx, setProjectIdx] = useState(0)
	const [dropdown, setDropdown] = useState(false)
	const [embedLoading, setEmbedLoading] = useState(true);
	const { colorMode } = useColorMode();

	const embedDiv = useRef(null);
	const editor = useRef(null);

	const projects: Project[] = [{
		name: 'starter bot ts',
		link: 'Wave-Play/robo.js/tree/main/templates/starter-bot-typescript',
		openFile: ''
	},
	{
		name: 'starter bot js',
		link: 'Wave-Play/robo.js/tree/main/templates/starter-bot-javascript',
		openFile: ''
	},
	{
		name: 'starter bot ts',
		link: 'Wave-Play/robo.js/tree/main/templates/starter-bot-typescript',
		openFile: ''
	}]
	

	useEffect(() => {
		if(editor && editor.current){
			editor.current.setTheme(colorMode);
		}
	}, [colorMode])

	useEffect(() => {
		if(embedDiv && embedDiv.current){
			setEmbedLoading(true);
			sdk.embedGithubProject('embed', projects[projectIdx].link, {
				devToolsHeight: 40,
				openFile: projects[projectIdx].openFile ? [projects[projectIdx].openFile] : undefined,
				showSidebar: true,
				terminalHeight: 40,
				theme: colorMode,
				view: 'default'
			}).then((v) => {
				setEmbedLoading(false)
				editor.current = v.editor
			});
		}
	}, [projectIdx])


	function renderSearchBar(){
		if(!embedLoading){
			if(dropdown){
				return <SearchbarFocused data={projects} setProjectIdx={setProjectIdx} setDropdown={setDropdown} /> ;
			} else {
				return (<input className={styles.searchBar}onFocus={() => setDropdown(true)} placeholder='Search for a Robo template'></input>)
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


function SearchbarFocused(props){
	const { data, setProjectIdx, setDropdown } = props;
	const [searchTemplate, setSearchTemplate] = useState('')

	return (
		<div className={styles.searchBarFocusContainer}>
			<input 
			className={styles.searchBarFocus}
			onChange={(event) => setSearchTemplate(event.target.value)} 
			value={searchTemplate} 
			placeholder='Search for a Robo template'>
			</input>

			{
				data.map((project: Project, idx: number) => {
					if(project.name.includes(searchTemplate)){
						return (<p onClick={() => {
							setProjectIdx(idx);
							setDropdown(false);
						}}>{project.name}</p>)
					}
				})
			}
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
