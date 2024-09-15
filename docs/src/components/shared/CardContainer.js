import React from 'react'

export const CardContainer = (props) => {
	const { children } = props

	return <div className="row cardContainer">{children}</div>
}
