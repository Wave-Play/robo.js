import React from 'react'

export const BeforeAfter = (props) => {
	const { from, to } = props

	return (
		<div className={'beforeAfter'}>
			<p className={'beforeAfterContent'}>{from}</p>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} className={'beforeAfterArrow'}>
				<title>arrow-down-bold</title>
				<path d="M9,4H15V12H19.84L12,19.84L4.16,12H9V4Z" />
			</svg>
			<p className={'beforeAfterContent'}>{to}</p>
		</div>
	)
}
