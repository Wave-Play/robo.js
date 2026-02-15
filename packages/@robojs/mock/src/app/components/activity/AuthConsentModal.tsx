import { useCallback } from 'react'
import styles from './AuthConsentModal.module.css'

interface AuthConsentModalProps {
	/** Whether the modal is visible */
	visible: boolean
	/** Application name (derived from application_id or placeholder) */
	applicationName: string
	/** Application ID */
	applicationId: string
	/** Requested scopes */
	scopes: string[]
	/** Callback when user approves */
	onApprove: (approvedScopes: string[]) => void
	/** Callback when user denies */
	onDeny: () => void
}

/**
 * Human-readable scope descriptions.
 * Mirrors Discord's OAuth2 scope display.
 */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
	'identify': 'Access your username, avatar, and banner',
	'email': 'Access your email address',
	'guilds': 'Know what servers you are in',
	'guilds.join': 'Join servers on your behalf',
	'guilds.members.read': 'Read your member info in servers',
	'gdm.join': 'Join group DMs on your behalf',
	'rpc': 'Read your game data',
	'rpc.notifications.read': 'Receive notifications',
	'rpc.voice.read': 'Access your voice status',
	'rpc.voice.write': 'Change your voice settings',
	'rpc.activities.write': 'Update your activity status',
	'bot': 'Create a bot for this application',
	'webhook.incoming': 'Create a webhook',
	'messages.read': 'Read your messages',
	'applications.builds.upload': 'Upload builds',
	'applications.builds.read': 'Read builds',
	'applications.commands': 'Use application commands',
	'applications.commands.update': 'Update application commands',
	'applications.commands.permissions.update': 'Update command permissions',
	'applications.store.update': 'Manage store listings',
	'applications.entitlements': 'Access store entitlements',
	'activities.read': 'Access your activities',
	'activities.write': 'Update your activities',
	'relationships.read': 'Access your friend list',
	'voice': 'Connect to voice',
	'dm_channels.read': 'Access your DM channels',
	'role_connections.write': 'Update your role connections',
	'presences.read': 'Read user presences',
	'presences.write': 'Update user presences',
	'openid': 'Access your user ID',
	'dm_channels.messages.read': 'Read messages in your DMs',
	'dm_channels.messages.write': 'Send messages in your DMs',
	'gateway.connect': 'Connect to the gateway',
	'account.global_name.update': 'Update your display name',
	'payment_sources.country_code': 'Access your country code'
}

export function AuthConsentModal({
	visible,
	applicationName,
	applicationId,
	scopes,
	onApprove,
	onDeny
}: AuthConsentModalProps) {
	if (!visible) return null

	const handleApprove = useCallback(() => {
		onApprove(scopes)
	}, [scopes, onApprove])

	return (
		<div className={styles.overlay}>
			<div className={styles.modal}>
				<div className={styles.header}>
					<div className={styles.appIcon}>
						<span>{applicationName.charAt(0).toUpperCase()}</span>
					</div>
					<h2 className={styles.title}>
						{applicationName} wants to access your Discord account
					</h2>
					<p className={styles.subtitle}>
						Application ID: {applicationId}
					</p>
				</div>

				<div className={styles.scopesList}>
					<h3 className={styles.scopesTitle}>This will allow the application to:</h3>
					<ul className={styles.scopes}>
						{scopes.map((scope) => (
							<li key={scope} className={styles.scopeItem}>
								<span className={styles.scopeCheck}>&#10003;</span>
								<span className={styles.scopeText}>
									{SCOPE_DESCRIPTIONS[scope] ?? scope}
								</span>
							</li>
						))}
					</ul>
				</div>

				<div className={styles.actions}>
					<button className={styles.denyButton} onClick={onDeny}>
						Cancel
					</button>
					<button className={styles.approveButton} onClick={handleApprove}>
						Authorize
					</button>
				</div>

				<p className={styles.disclaimer}>
					Mock authorization -- no real OAuth flow occurs
				</p>
			</div>
		</div>
	)
}
