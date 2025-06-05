import React, { useEffect, useRef } from 'react'
import clsx from 'clsx'
import ErrorBoundary from '@docusaurus/ErrorBoundary'
import { PageMetadata, SkipToContentFallbackId, ThemeClassNames } from '@docusaurus/theme-common'
import { useKeyboardNavigation } from '@docusaurus/theme-common/internal'
import SkipToContent from '@theme/SkipToContent'
import AnnouncementBar from '@theme/AnnouncementBar'
import Navbar from '@theme/Navbar'
import Footer from '@theme/Footer'
import LayoutProvider from '@theme/Layout/Provider'
import ErrorPageContent from '@theme/ErrorPageContent'
import styles from './styles.module.css'
export default function Layout(props) {
	const {
		children,
		noFooter,
		wrapperClassName,
		// Not really layout-related, but kept for convenience/retro-compatibility
		title,
		description
	} = props

	useEffect(() => {
		if(window){

			const parsedUrl = new URL(window.location.href);
			const platform = parsedUrl.searchParams.get("parent");

			if (platform === 'robokit') {
				localStorage.setItem('platform', 'robokit');
			}
		
			const localStoredPlatform = localStorage.getItem('platform');
			if (localStoredPlatform && localStoredPlatform === 'robokit') {
				const navbar = document.querySelector('.navbar')
				if (navbar) {
					navbar.style.height = 0;
					navbar.style.padding = 0;
					navbar.style.margin = 0;

					const firstChild = navbar.firstChild;
					if (firstChild) {
						firstChild.style.display = "none";
						firstChild.style.pointerEvents = "none";
					}
				}
			}

			window.addEventListener("message", (event) => {
				if (event.origin !== process.env.DOCUSAURUS_ROBOKIT_URL) return;

				// Access the data sent
				const data = event.data;

				if (data.action) {
					const action = data.action;
					const navbarToggle = document.querySelector('.navbar__toggle');

					if (action === 'open_menu') {
						if (navbarToggle) {
							navbarToggle.classList.add('navbar-sidebar--show')
						}
					}

					if(action === 'close_menu') {
						if (navbarToggle) {
							navbarToggle.classList.remove('navbar-sidebar--show')
						}
					}
				}
			});

		}

	}, [])


	useKeyboardNavigation()
	return (
		<LayoutProvider>
			<PageMetadata title={title} description={description} />

			<SkipToContent />

			<AnnouncementBar />

			<Navbar />

			<div
				id={SkipToContentFallbackId}
				className={clsx(ThemeClassNames.wrapper.main, styles.mainWrapper, wrapperClassName)}
			>
				<ErrorBoundary fallback={(params) => <ErrorPageContent {...params} />}>{children}</ErrorBoundary>
			</div>

			{!noFooter && <Footer />}
		</LayoutProvider>
	)
}
