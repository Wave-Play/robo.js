import { useEffect } from 'react'

export const Activity = () => {
	useEffect(() => {
		if (window) {
			const iframe: HTMLIFrameElement | null = document.querySelector('#dissonity-child')

			if (iframe) {
				iframe.onload = () => {
					var iframeDoc = iframe.contentDocument || iframe.contentWindow?.document

					if (iframeDoc) {
						const canvas: HTMLIFrameElement | null = iframeDoc.querySelector('#unity-canvas')

						if (canvas) {
							canvas.style.width = '100vw'
							canvas.style.height = '100vh'
						}
					}
				}
			}
		}
	}, [])
	return <iframe id="dissonity-child" src=".proxy/index.html" height="100vh" width="100vw" scrolling="no"></iframe>
}
