import { useCallback } from 'react'
import { useWebSocket } from '../../stores/sessionStore'
import styles from './PurchaseModal.module.css'
import type { StageActivityPurchaseRequestData } from '../../types/stage'

interface PurchaseModalProps {
	purchaseData: StageActivityPurchaseRequestData
	onClose: () => void
}

/**
 * Format a price amount (cents) to a display string.
 * e.g., 499 usd -> "$4.99"
 */
function formatPrice(amount: number, currency: string): string {
	const symbols: Record<string, string> = { usd: '$', eur: '\u20AC', gbp: '\u00A3', jpy: '\u00A5' }
	const symbol = symbols[currency.toLowerCase()] ?? currency.toUpperCase() + ' '
	const value = (amount / 100).toFixed(2)
	return `${symbol}${value}`
}

export function PurchaseModal({ purchaseData, onClose }: PurchaseModalProps) {
	const { sendCommand } = useWebSocket()

	const handleBuy = useCallback(() => {
		sendCommand('activity_purchase_result', {
			nonce: purchaseData.nonce,
			approved: true
		})
		onClose()
	}, [purchaseData.nonce, sendCommand, onClose])

	const handleCancel = useCallback(() => {
		sendCommand('activity_purchase_result', {
			nonce: purchaseData.nonce,
			approved: false
		})
		onClose()
	}, [purchaseData.nonce, sendCommand, onClose])

	return (
		<div className={styles.overlay}>
			<div className={styles.modal}>
				<div className={styles.header}>
					<div className={styles.skuIcon}>
						<span>&#128176;</span>
					</div>
					<h2 className={styles.title}>Purchase Item</h2>
				</div>

				<div className={styles.details}>
					<div className={styles.skuName}>{purchaseData.sku_name}</div>
					<div className={styles.skuPrice}>
						{formatPrice(purchaseData.sku_price.amount, purchaseData.sku_price.currency)}
					</div>
				</div>

				<div className={styles.actions}>
					<button className={styles.cancelButton} onClick={handleCancel}>
						Cancel
					</button>
					<button className={styles.buyButton} onClick={handleBuy}>
						Buy
					</button>
				</div>

				<p className={styles.disclaimer}>
					Mock purchase -- no real payment occurs
				</p>
			</div>
		</div>
	)
}
