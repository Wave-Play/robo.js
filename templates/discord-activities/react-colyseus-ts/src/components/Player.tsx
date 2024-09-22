import type { TPlayerOptions } from '../entities/Player'

export function Player({ avatarUri, name, talking }: TPlayerOptions) {
	return (
		<div className="player__container">
			<div className={`player__avatar ${talking ? 'player__avatar__talking' : ''}`}>
				<img className="player__avatar__img" src={avatarUri} width="100%" height="100%" />
			</div>
			<div>{name}</div>
		</div>
	)
}
