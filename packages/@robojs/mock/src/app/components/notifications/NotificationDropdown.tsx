import { useState } from 'react'
import { DropdownContainer, ListItem, ListItemSeparator } from '../base'
import styles from './NotificationDropdown.module.css'

type NotificationSetting = 'category-default' | 'all-messages' | 'only-mentions' | 'nothing'

interface NotificationDropdownProps {
	onClose?: () => void
}

const muteDurations = [
	'For 15 Minutes',
	'For 1 Hour',
	'For 3 Hours',
	'For 8 Hours',
	'For 24 Hours',
	'Until I turn it back on'
]

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
	const [selectedSetting, setSelectedSetting] = useState<NotificationSetting>('category-default')
	const [showMuteSubmenu, setShowMuteSubmenu] = useState(false)

	const settings: Array<{ value: NotificationSetting; label: string; sublabel?: string }> = [
		{ value: 'category-default', label: 'Use Category Default', sublabel: 'Nothing' },
		{ value: 'all-messages', label: 'All Messages' },
		{ value: 'only-mentions', label: 'Only @mentions' },
		{ value: 'nothing', label: 'Nothing' }
	]

	return (
		<DropdownContainer placement="bottom-end" className={styles.container} role="menu">
			<div className={styles.mainPanel} onMouseLeave={() => setShowMuteSubmenu(false)}>
				<ListItem
					label="Mute Channel"
					onMouseEnter={() => setShowMuteSubmenu(true)}
					onClick={onClose}
					rightContent={<ChevronRightIcon />}
					role="menuitem"
				/>

				<ListItemSeparator />

				{settings.map((setting) => (
					<ListItem
						key={setting.value}
						label={setting.label}
						description={setting.sublabel}
						onClick={() => {
							setSelectedSetting(setting.value)
						}}
						onMouseEnter={() => setShowMuteSubmenu(false)}
						isSelected={selectedSetting === setting.value}
						rightContent={<Radio isSelected={selectedSetting === setting.value} />}
						role="menuitem"
					/>
				))}
			</div>

			{showMuteSubmenu && (
				<div
					className={styles.submenuPanel}
					onMouseEnter={() => setShowMuteSubmenu(true)}
					onMouseLeave={() => setShowMuteSubmenu(false)}
				>
					{muteDurations.map((duration) => (
						<ListItem key={duration} label={duration} onClick={onClose} role="menuitem" />
					))}
				</div>
			)}
		</DropdownContainer>
	)
}

function ChevronRightIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
			<path d="M9.29 6.71a.996.996 0 0 0 0 1.41L13.17 12l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L10.7 6.7c-.38-.38-1.02-.38-1.41.01z" />
		</svg>
	)
}

interface RadioProps {
	isSelected: boolean
}

function Radio({ isSelected }: RadioProps) {
	return (
		<div className={`${styles.radio} ${isSelected ? styles.radioSelected : ''}`}>
			{isSelected && <div className={styles.radioInner} />}
		</div>
	)
}
