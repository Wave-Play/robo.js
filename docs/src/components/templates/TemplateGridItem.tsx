import React, { useId } from 'react'
import { ExaShape } from '../shared/ExaShape'
import Link from '@docusaurus/Link'
import styles from '../../pages/templates.module.css'
import { getPreview, Template } from '@site/src/data/templates'
import Icon from '@mdi/react'
import {
	mdiHelp,
	mdiLanguageJavascript,
	mdiLanguageTypescript,
	mdiLightbulb,
	mdiPowerPlug,
	mdiRobot,
	mdiShapePlus,
	mdiWeb
} from '@mdi/js'
import { ExaGrow } from '../shared/ExaGrow'
import { ExaZoom } from '../shared/ExaZoom'
import { Media } from '@site/src/core/media'

const BaseImage = {
	Height: 249,
	Width: 442
}

interface TemplateGridItemProps {
	template: Template
}

export const TemplateGridItem = (props: TemplateGridItemProps) => {
	const { template } = props
	const preview = getPreview(template)

	return (
		<ExaGrow scale={1.04} style={{ maxWidth: 'min(calc(100vw - 32px), 444px)', width: '100%' }}>
			<Link className={styles.templateItem} to={template.href}>
				<ExaShape defaultHeight={360} defaultWidth={432} innerBorderWidth={2}>
					<div className={styles.template}>
						<ExaShape
							blur={false}
							clip={true}
							defaultHeight={249.75}
							highlight={false}
							innerBorderWidth={2}
							innerColor={'var(--template-item-background)'}
							outerColor={'transparent'}
							style={{
								width: 'calc(100% - 2px)',
								height: 'auto',
								aspectRatio: 16 / 9,
								marginLeft: 1,
								marginTop: 1
							}}
						>
							<>
								<ExaZoom
									className={styles.templateImageStub}
									origin={template.decorator === false ? 'center' : 'center right'}
									scale={template.decorator === false ? 1.06 : 1.25}
								>
									<img
										className={styles.templateImage}
										src={Media.url(preview, { width: BaseImage.Width, height: BaseImage.Height })}
										srcSet={Media.urlSet(preview, { width: BaseImage.Width, height: BaseImage.Height })}
										alt={template.title}
									/>
								</ExaZoom>
							</>
						</ExaShape>
						<h3 className={styles.templateTitle}>{template.title}</h3>
						<p className={styles.templateDescription}>{template.description}</p>
						<div className={styles.templateFooter}>
							{template.tags.map((tag) => ({ tag })).map(TemplateTagIcon)}
							{template.author && (
								<span className={styles.templateAuthorContainer}>
									<span className={styles.templateAuthorBy}>By </span>
									<strong
										className={template.author === 'WavePlay' ? styles.templateAuthorWavePlay : styles.templateAuthor}
									>
										{template.author}
									</strong>
								</span>
							)}
						</div>
					</div>
				</ExaShape>
			</Link>
		</ExaGrow>
	)
}

interface TemplateTagIconProps {
	tag: string
}
const TemplateTagIcon = (props: TemplateTagIconProps) => {
	const { tag } = props
	const id = useId()
	const key = tag + id

	switch (tag) {
		case 'Discord Activity':
			return <Icon key={key} path={mdiShapePlus} color={'#25C2A0'} size={'20px'} />
		case 'Discord Bot':
			return <Icon key={key} path={mdiRobot} color={'#5865F2'} size={'20px'} />
		case 'JavaScript':
			return <Icon key={key} path={mdiLanguageJavascript} color={'#F7DF1E'} size={'20px'} />
		case 'MrJAwesome':
			return <Icon key={key} path={mdiLightbulb} color={'#FFD700'} size={'20px'} />
		case 'Plugin':
			return <Icon key={key} path={mdiPowerPlug} size={'20px'} />
		case 'TypeScript':
			return <Icon key={key} path={mdiLanguageTypescript} color={'#3178C6'} size={'20px'} />
		case 'Web App':
			return <Icon key={key} path={mdiWeb} color={'#00BCD4'} size={'20px'} />
		default:
			return <Icon key={key} path={mdiHelp} size={'20px'} />
	}
}
