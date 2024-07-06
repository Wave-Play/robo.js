import React from 'react'
import Link from '@docusaurus/Link'
import Heading from '@theme/Heading'

export const Card = (props) => {
	const { description, href, title } = props

	return (
		<Link className="col col--6 nodecor margin-bottom--lg" to={href}>
			<div className={'card padding--lg cardContent'}>
				<Heading as="h4" className="text--truncate cardTitle">
					{title}
				</Heading>
				<p className="text--truncate cardDescription">{description}</p>
			</div>
		</Link>
	)
}
