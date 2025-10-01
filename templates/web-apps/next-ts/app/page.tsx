'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import './App.css'

export default function HomePage() {
	const { count, increment } = useCounter()

	return (
		<main className="page">
			<header className="masthead">
				<h1>Next.js + Robo.js, ready to deploy.</h1>
				<p>
					Build hybrid dashboards that combine React Server Components with Robo APIs. Keep UI files inside <code>/app</code> and
					server logic in <code>/src</code> for a clean split between frameworks.
				</p>
				<div className="cta-row">
					<Link href="/example" className="link-button">
						Explore /example
					</Link>
					<a className="link-ghost" href="https://roboplay.dev/templates/web-apps/react-ts" target="_blank" rel="noreferrer">
						Compare with react-ts
					</a>
				</div>
			</header>

			<section className="info-grid">
				<article className="info-card">
					<h3>Shared counter API</h3>
					<p>
						This button calls the pre-built Robo API routes under <code>/src/api</code>. Replace them with your own handlers to surface
							data in Next components.
					</p>
					<button onClick={increment}>Counter: {count}</button>
				</article>

				<article className="info-card">
					<h3>Directory roles</h3>
					<p>
						Keep all Next.js routes, layouts, and components inside <code>/app</code>. Robo-specific code—commands, events, APIs, plugins—lives
							in <code>/src</code> so upgrades stay tidy.
					</p>
				</article>

				<article className="info-card">
					<h3>Stack plugins</h3>
					<p>
						Add tooling like <code>@robojs/auth</code> or <code>@robojs/sync</code> from <code>config/plugins</code>. Robo injects them into the runtime without touching
							your Next routes.
					</p>
				</article>
			</section>

			<p className="note">
				When deploying, run <code>next build</code> alongside <code>robo build</code> to compile both halves of the project.
			</p>
		</main>
	)
}

function useCounter() {
	const [count, setCount] = useState(0)

	useEffect(() => {
		const run = async () => {
			const data = await fetch('/api/get-count').then((res) => res.json())
			setCount(data.count)
		}
		run()
	}, [])

	const increment = async () => {
		const data = await fetch('/api/set-count').then((res) => res.json())
		setCount(data.count)
	}

	return { count, increment }
}
