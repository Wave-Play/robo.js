import { useEffect, useRef, useState } from 'react'

export function useMicrophone(enabled: boolean) {
	const [isSpeaking, setIsSpeaking] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const vadRef = useRef<any>(null)

	useEffect(() => {
		if (!enabled) {
			// Cleanup existing VAD instance
			if (vadRef.current) {
				vadRef.current.pause()
				vadRef.current.destroy()
				vadRef.current = null
			}
			setIsSpeaking(false)
			setIsLoading(false)
			return
		}

		let cancelled = false

		const start = async () => {
			setIsLoading(true)
			try {
				// Dynamic import — downloads the library chunk only now
				const { MicVAD } = await import('@ricky0123/vad-web')
				if (cancelled) return

				const myvad = await MicVAD.new({
					baseAssetPath: './',
					onnxWASMBasePath: './',
					startOnLoad: false,
					ortConfig: (ort) => {
						ort.env.wasm.numThreads = 1
					},
					onSpeechStart: () => {
						if (!cancelled) setIsSpeaking(true)
					},
					onSpeechEnd: () => {
						if (!cancelled) setIsSpeaking(false)
					},
				})
				if (cancelled) {
					myvad.pause()
					myvad.destroy()
					return
				}

				vadRef.current = myvad
				myvad.start()
			} catch {
				// Permission denied, no mic, or model load failure
			} finally {
				if (!cancelled) setIsLoading(false)
			}
		}

		start()

		return () => {
			cancelled = true
			if (vadRef.current) {
				vadRef.current.pause()
				vadRef.current.destroy()
				vadRef.current = null
			}
			setIsSpeaking(false)
			setIsLoading(false)
		}
	}, [enabled])

	return { isSpeaking, isLoading }
}
