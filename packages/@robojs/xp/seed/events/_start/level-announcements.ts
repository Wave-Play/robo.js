import { events, math } from '@robojs/xp'
import { EmbedBuilder } from 'discord.js'
import { client } from 'robo.js'

/**
 * Level-Up Announcements
 *
 * This seed file demonstrates the @robojs/xp plugin's event-driven API by creating
 * a MEE6-style level-up announcement system. When users gain enough XP to level up,
 * a rich embed is automatically sent to announce their achievement.
 *
 * Key Features:
 * - Automatically sends rich embeds when users level up
 * - Uses XP.events.onLevelUp() to listen for level changes
 * - Shows progress bars, level info, and XP statistics
 * - Completely customizable (channel selection, embed design, conditional logic)
 *
 * Customization Options:
 * - Change announcement channel (by name, ID, or from config)
 * - Modify embed appearance (colors, fields, images, layout)
 * - Add milestone filtering (only announce every 5 levels, etc.)
 * - Implement role-based routing (VIP members to special channel)
 * - Add DM notifications for private level-up messages
 * - Create custom message templates with variables
 *
 * Learn more:
 * - XP API documentation: https://robojs.dev/plugins/xp
 * - Event system guide: https://robojs.dev/plugins/xp#events
 * - Integration recipes: https://robojs.dev/plugins/xp#integration-recipes
 */
export default async () => {
	// Register level-up event listener (runs once at bot startup)
	events.onLevelUp(async (event) => {
		try {
			// Destructure event payload
			const { guildId, userId, newLevel, totalXp } = event

			// Fetch Discord objects to access user info and channels
			const guild = await client.guilds.fetch(guildId)
			const member = await guild.members.fetch(userId)

			// ===== Channel Selection =====
			// Channel Selection Options:
			// 1. By name: guild.channels.cache.find(c => c.name === 'level-ups')
			// 2. By ID: guild.channels.cache.get('123456789')
			// 3. From config: await getAnnouncementChannel(guildId)
			// 4. Multiple channels: Send to array of channels based on level
			let channel = guild.channels.cache.find((c) => c.name === 'level-ups')

			// Fallback to system channel if 'level-ups' doesn't exist
			if (!channel) {
				channel = guild.systemChannel ?? undefined
			}

			// Exit gracefully if no suitable channel found
			if (!channel?.isTextBased()) {
				return
			}

			// Check if the bot has permission to send messages in this channel
			const botMember = guild.members.me
			if (!botMember || !channel.permissionsFor(botMember).has('SendMessages')) {
				return
			}

			// ===== Calculate Level Progression =====
			// Use XP.math utilities to calculate level progression
			const nextLevelXp = math.xpNeededForLevel(newLevel + 1)
			const progress = math.progressInLevel(totalXp)

			// Create visual progress bar using Unicode blocks (15 blocks total)
			const filledBlocks = Math.floor((progress.percentage / 100) * 15)
			const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(15 - filledBlocks)

			// ===== Build MEE6-Style Embed =====
			const embed = new EmbedBuilder()
				.setTitle('🎉 Level Up!')
				.setDescription(`${member} just reached **Level ${newLevel}**!`)
				.setColor('#5865F2') // Discord Blurple
				.setThumbnail(member.displayAvatarURL({ size: 256 }))
				.addFields(
					{ name: 'Current Level', value: `${newLevel}`, inline: true },
					{ name: 'Total XP', value: `${totalXp.toLocaleString()}`, inline: true },
					{ name: 'Next Level', value: `${nextLevelXp.toLocaleString()} XP`, inline: true },
					{ name: 'Progress', value: `${progressBar} ${progress.percentage.toFixed(1)}%`, inline: false }
				)
				.setFooter({ text: `Keep chatting to reach Level ${newLevel + 1}!` })
				.setTimestamp()

			// Embed Customization Options:
			// - Change color: .setColor('#FF0000') for red
			// - Add image: .setImage(bannerUrl) for level milestone banners
			// - Custom footer: .setFooter({ text: 'Custom message', iconURL: guild.iconURL() })
			// - Add fields: .addFields({ name: 'Rank', value: '#1', inline: true })
			// - Remove thumbnail: Delete .setThumbnail() line

			// Send the announcement embed to the channel
			await channel.send({ embeds: [embed] })
		} catch (error) {
			// Log errors but don't disrupt the XP system
			console.error('Error sending level-up announcement:', {
				guildId: event.guildId,
				userId: event.userId,
				newLevel: event.newLevel,
				error
			})
		}
	})
}

/**
 * Advanced Customization Examples
 *
 * Example 1: Milestone Filtering
 * Only announce every 5 levels:
 *   if (newLevel % 5 !== 0) return
 *
 * Example 2: Role-Based Routing
 * Send VIP members to special channel:
 *   const isVip = member.roles.cache.has(VIP_ROLE_ID)
 *   const channel = isVip ? vipChannel : regularChannel
 *
 * Example 3: DM Notifications
 * Also send a DM to the user:
 *   try {
 *     await member.send({ embeds: [embed] })
 *   } catch (error) {
 *     // User has DMs disabled
 *   }
 *
 * Example 4: Multi-Channel Announcements
 * Send to multiple channels based on level:
 *   const channels = newLevel >= 50 ? [mainChannel, vipChannel] : [mainChannel]
 *   await Promise.all(channels.map(ch => ch.send({ embeds: [embed] })))
 *
 * Example 5: Custom Message Templates
 * Use template system:
 *   const template = config.levelUpMessage || '{user} reached Level {level}!'
 *   const message = template.replace('{user}', member.toString()).replace('{level}', newLevel)
 *
 * See README Integration Recipes section for more examples:
 * https://robojs.dev/plugins/xp#integration-recipes
 */
