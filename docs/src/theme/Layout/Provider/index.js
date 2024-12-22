import React from 'react'
import { composeProviders } from '@docusaurus/theme-common'
import {
	ColorModeProvider,
	AnnouncementBarProvider,
	DocsPreferredVersionContextProvider,
	ScrollControllerProvider,
	NavbarProvider,
	PluginHtmlClassNameProvider
} from '@docusaurus/theme-common/internal'
import { MediaContextProvider } from '../../../components/shared/Breakpoints'

const Provider = composeProviders([
	ColorModeProvider,
	AnnouncementBarProvider,
	ScrollControllerProvider,
	DocsPreferredVersionContextProvider,
	PluginHtmlClassNameProvider,
	NavbarProvider,
	MediaContextProvider
])

export default function LayoutProvider({ children }) {
	return <Provider>{children}</Provider>
}
