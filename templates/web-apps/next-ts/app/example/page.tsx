import Link from 'next/link'
import '../App.css'

export default function ExamplePage() {
	return (
		<section className="example-container">
			<div className="example-card">
				<h1>Inside /app/example/page.tsx</h1>
				<p>
					This route demonstrates how Next.js pages live under <code>/app</code>. It renders as a React Server Component by default, while Robo
						continues to serve APIs, commands, and plugins out of <code>/src</code>.
				</p>
				<p>
					Try adding <code>/app/dashboard/page.tsx</code> or a layout file. You can consume Robo APIs with <code>fetch</code> or server helpers just like the
						counter on the home page.
				</p>
				<Link href="/" className="back-link">
					Back to the home page
				</Link>
			</div>
		</section>
	)
}
