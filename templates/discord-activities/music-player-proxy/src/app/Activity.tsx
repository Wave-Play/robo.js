import { Player } from './Player'

const ExternalUrl = 'https://media.waveplay.com/t/ckwldfuiq6608re6x8dzc5tyt.mp3'

export const Activity = () => {
	return (
		<div>
			<img src="/rocket.png" className="logo" alt="Discord" />
			<h1>Hello, World</h1>
			<Player url={'/api/proxy?url=' + ExternalUrl} />
			<p>
				<small>
					Powered by{' '}
					<a className="robojs" href="https://roboplay.dev/docs">
						Robo.js
					</a>
				</small>
			</p>
		</div>
	)
}
