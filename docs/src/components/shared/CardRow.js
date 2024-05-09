import React from 'react'
import Link from '@docusaurus/Link'
import Heading from '@theme/Heading'

export const CardRow = (props) => {
	const { children } = props

	return <div className="row">{children}</div>
}
