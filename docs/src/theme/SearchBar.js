import React, { useEffect } from 'react'
import 'meilisearch-docsearch/css'

export default function SearchBarWrapper() {
	useEffect(() => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const docsearch = require('meilisearch-docsearch').default
		const destroy = docsearch({
			host: 'https://search.waveplay.com',
			apiKey: 'cf8d8c1b365c027511e244cdbd8712839e1e4a147a3b27b4400a831980edd196',
			indexUid: 'robojs',
			container: '#docsearch'
		})

		return () => destroy()
	}, [])

	return <div id="docsearch"></div>
}
