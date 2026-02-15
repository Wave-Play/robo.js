/**
 * Seed data generators for IAP/Social/Quest DevTools editors.
 */
import { generateSnowflake } from '../../utils/snowflake.js'
import type { IapState, RelationshipState, QuestState } from './iap-types.js'

/**
 * Generate seed IAP data with example SKUs and entitlements.
 */
export function generateSeedIapData(applicationId: string, userId: string): IapState {
	const premiumSkuId = generateSnowflake()
	const gemPackSkuId = generateSnowflake()
	const cosmeticSkuId = generateSnowflake()

	return {
		skus: [
			{
				id: premiumSkuId,
				name: 'Premium Pass',
				type: 5, // SUBSCRIPTION
				application_id: applicationId,
				slug: 'premium-pass',
				price: { amount: 499, currency: 'usd' },
				flags: 0
			},
			{
				id: gemPackSkuId,
				name: 'Gem Pack (100)',
				type: 3, // CONSUMABLE
				application_id: applicationId,
				slug: 'gem-pack-100',
				price: { amount: 199, currency: 'usd' },
				flags: 0
			},
			{
				id: cosmeticSkuId,
				name: 'Exclusive Skin',
				type: 2, // DURABLE
				application_id: applicationId,
				slug: 'exclusive-skin',
				price: { amount: 299, currency: 'usd' },
				flags: 0
			}
		],
		entitlements: [
			{
				id: generateSnowflake(),
				sku_id: premiumSkuId,
				user_id: userId,
				application_id: applicationId,
				type: 4, // APPLICATION_SUBSCRIPTION
				consumed: false,
				starts_at: new Date().toISOString(),
				ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			}
		]
	}
}

/**
 * Generate seed relationship data.
 */
export function generateSeedRelationshipData(): RelationshipState {
	return {
		relationships: [
			{
				id: generateSnowflake(),
				type: 1, // FRIEND
				user: {
					id: generateSnowflake(),
					username: 'FriendUser1',
					discriminator: '0',
					avatar: null,
					global_name: 'Friend One'
				},
				presence: { status: 'online', activities: [] }
			},
			{
				id: generateSnowflake(),
				type: 1, // FRIEND
				user: {
					id: generateSnowflake(),
					username: 'FriendUser2',
					discriminator: '0',
					avatar: null,
					global_name: 'Friend Two'
				},
				presence: { status: 'idle', activities: [] }
			},
			{
				id: generateSnowflake(),
				type: 3, // PENDING_INCOMING
				user: {
					id: generateSnowflake(),
					username: 'PendingUser',
					discriminator: '0',
					avatar: null,
					global_name: 'Pending Request'
				}
			}
		]
	}
}

/**
 * Generate seed quest data.
 */
export function generateSeedQuestData(): QuestState {
	const questId = generateSnowflake()
	return {
		quests: [
			{
				id: questId,
				name: 'Play for 15 minutes',
				description: 'Play the activity for 15 minutes to earn a reward',
				reward_code_sku_id: generateSnowflake(),
				enrollment_status: {
					quest_id: questId,
					enrolled_at: new Date(Date.now() - 3600000).toISOString(),
					completed_at: null,
					progress: 35,
					timer_started_at: null,
					timer_duration_seconds: 900 // 15 minutes
				}
			}
		]
	}
}
