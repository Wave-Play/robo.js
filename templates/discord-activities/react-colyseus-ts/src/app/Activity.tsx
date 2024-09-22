import { usePlayers } from '../hooks/usePlayers'
import { Player } from '../components/Player'

export const Activity = () => {
	const players = usePlayers()

	return (
		<div className="voice__channel__container">
			{players.map((p) => (
				<Player key={p.userId} {...p} />
			))}
		</div>
	)
}
