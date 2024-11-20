<script lang="ts">
	import { onMount } from 'svelte';

	let c: number;
	let apiUrl: URL;

	const setAction = async (action: string) => {
		const response = await fetch(`${apiUrl}api/set-count?action=${action}`);
		const json = await response.json();
		c = json.newCount;
    console.log(json)
	};

	const getCount = async () => {
		const response = await (await fetch(`${apiUrl}api/get-count`)).json();
		c = response.count;
	};

	onMount(async () => {
		apiUrl = new URL(window.location.href);
		apiUrl.port = '3000';
		await getCount();
	});
</script>

<section class="home">
	<h1>Robo.js Web App - SvelteKit Starter - TS</h1>
	<h2>Simple Counter</h2>
	<div class="counter-wrapper">
		<div class="counter">
			<div class="buttons">
				<button id="decrease" on:click={() => setAction('decrement')}>−</button>
				<button id="increase" on:click={() => setAction('increment')}>+</button>
			</div>
			<div id="numberDisplay" class="number">{c}</div>
			<button id="reset" class="reset" on:click={() => setAction('reset')}>RESET COUNTER</button>
		</div>
	</div>

	<!-- https://robojs.dev/ | https://svelte.dev/ -->
	<p class="info">
		Made with <a href="https://svelte.dev/">SvelteKit</a> and
		<a href="https://robojs.dev/">Robo.js</a>
	</p>
	<!-- https://docs.roboplay.dev/robojs/flashcore -->
	<p class="info">
		Counter information is stored inside <a href="https://robojs.dev/robojs/flashcore"
			>Robo.js Flashcore.</a
		>
	</p>
</section>

<style>
	.home h1 {
		color: #fff;
	}

	.home h2 {
		color: #25c2a0;
	}

	.home h1,
	.home h2 {
		text-align: center;
	}

	.home .counter-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 60vh;
	}

	.home .counter {
		display: flex;
		flex-direction: column;
		border-radius: 50px;
		padding: 10px 20px;
	}

	.home .counter .buttons {
		display: flex;
		justify-content: center;
		gap: 16px;
	}

	.home .counter button {
		background: none;
		border: 1.5px solid #737373;
		color: #888;
		font-size: 24px;
		cursor: pointer;
		padding: 10px 17px;
		border-radius: 9999px;
		transition: 0.2s;
	}

	.home .counter button:hover {
		color: #25c2a0;
		border-color: #25c2a0;
	}

	.home .counter .reset {
		border: 1.5px solid #ffcc66;
		color: #ffcc66;
		font-size: 14px;
	}

	.home .counter .reset:hover {
		border: 1.5px solid #ffb380;
		color: #ffb380;
	}

	.home .counter .number {
		color: white;
		font-size: 36px;
		font-weight: bold;
		height: 60px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 15px;
		padding: 5px;
		transition: width 0.2s;
	}

	.home .info {
		font-size: 18px;
		color: #fff;
		text-align: center;
	}

	.home .info > a {
		color: #25c2a0;
		transition: 0.2s;
	}

	.home .info > a:hover {
		color: #3edab8;
	}
</style>
