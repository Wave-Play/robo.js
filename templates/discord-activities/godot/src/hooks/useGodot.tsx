import { useEffect, useState } from 'react'

declare class Engine {
	constructor(options: any)
	config: any
	init: (basePath?: string | undefined) => Promise<any>
	preloadFile: (file: string | ArrayBuffer, path?: string | undefined) => Promise<any>
	start: (options?: any) => Promise<any>
}

export const useGodot = (pathAndName: string, fileSizes?: { pck: number; wasm: number }) => {
	const [engine, setEngine] = useState<Engine>()
	const [loading, setLoading] = useState<Boolean | number>(true)
	useEffect(() => {
		const script = document.createElement('script')

		script.src = pathAndName + '.js'
		script.async = true
		script.onload = () =>
			setEngine(
				new Engine({
					args: [],
					fileSizes: fileSizes && { [pathAndName + '.pck']: fileSizes.pck, [pathAndName + '.wasm']: fileSizes.wasm },
					canvasResizePolicy: 2,
					executable: pathAndName,
					experimentalVK: false,
					focusCanvas: true,
					gdextensionLibs: []
				})
			)

		document.body.appendChild(script)

		return () => {
			document.body.removeChild(script)
		}
	}, [])

	useEffect(() => {
		if (!engine) {
			return
		}
		engine.config.update({
			onProgress: function (current: number, total: number) {
				if (!fileSizes) return
				const percent = Math.floor((current / total) * 100)
				setLoading(percent)
			}
		})
		const exe = engine.config.executable
		const pack = engine.config.mainPack || `${exe}.pck`
		engine.config.args = ['--main-pack', pack].concat(engine.config.args)
		Promise.all([engine.init(exe), engine.preloadFile(pack, pack)]).then(function () {
			setLoading(false)
		})
	}, [engine])

	function startGame() {
		if (!engine) {
			return
		}
		engine.start()
	}

	return { startGame, loading }
}
