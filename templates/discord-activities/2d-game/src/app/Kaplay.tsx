import kaplay from 'kaplay'

/**
 * Kaplay game here
 */
export default function game() {
	const k = kaplay({
		letterbox: true,
		global: false,
		debug: true,
		width: window.innerWidth,
		height: window.innerHeight,
		pixelDensity: devicePixelRatio
	})

	/**
	 * Constants
	 */
	const FLOOR_HEIGHT = k.height() / 3
	const JUMP_FORCE = 999
	const SPEED = 450

	k.setBackground(26, 31, 43)
	k.loadSprite('wumpus', '/rocket.png')

	k.scene('gameplay', () => {
		k.setGravity(2400)

		const playable = k.add([k.sprite('wumpus'), k.pos(80, 40), k.area(), k.body(), k.scale(0.2)])

		k.add([
			k.rect(k.width(), FLOOR_HEIGHT),
			k.outline(1),
			k.pos(0, k.height()),
			k.anchor('botleft'),
			k.area(),
			k.body({ isStatic: true }),
			k.color(246, 241, 213)
		])

		function dodgeByJumping() {
			if (playable.isGrounded()) playable.jump(JUMP_FORCE)
		}
		k.onClick(dodgeByJumping)
		k.onKeyPress('space', dodgeByJumping)

		function spawnDistraction() {
			k.add([
				k.rect(49, k.rand(32, 96)),
				k.area(),
				k.pos(k.width() + 200, k.height() - FLOOR_HEIGHT),
				k.anchor('botleft'),
				k.color(246, 241, 213),
				k.move(k.LEFT, SPEED),
				k.offscreen({ destroy: true }),
				'distraction'
			])
			k.wait(k.rand(0.5, 1.5), spawnDistraction)
		}
		spawnDistraction()

		playable.onCollide('distraction', () => {
			k.go('gameover', user_score)
			k.burp()
			k.addKaboom(playable.pos)
		})

		let user_score = 0

		const scoreLabel = k.add([k.text(user_score.toString()), k.pos(25, 25)])

		k.onUpdate(() => {
			user_score++
			scoreLabel.text = user_score.toString()
		})
	})

	k.scene('gameover', (score) => {
		k.add([k.sprite('wumpus'), k.pos(k.width() / 2, k.height() / 2 - 64), k.scale(0.5), k.anchor('center')])

		k.add([k.text(`Score: ${score}`), k.pos(k.width() / 2, k.height() / 2 + 64), k.scale(2), k.anchor('center')])

		k.onKeyPress('space', () => k.go('gameplay'))
		k.onClick(() => k.go('gameplay'))
	})

	// Land user to game
	k.go('gameplay')

	return k
}
