import { define } from '@robojs/server'
import { z } from 'zod'

/**
 * GET /api/v10/voice/regions - Discord Voice Regions endpoint mock
 *
 * Returns a list of available voice regions that can be used when
 * creating/updating voice channels.
 */
export const GET = define(
	{
		summary: 'List voice regions',
		tags: ['Voice'],
		response: {
			200: z.array(z.object({
				id: z.string(),
				name: z.string(),
				optimal: z.boolean(),
				deprecated: z.boolean(),
				custom: z.boolean()
			})).nullable()
		}
	},
	async () => {
	// Return mock voice regions matching Discord's format
	return [
		{
			id: 'us-west',
			name: 'US West',
			optimal: true,
			deprecated: false,
			custom: false
		},
		{
			id: 'us-east',
			name: 'US East',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'us-central',
			name: 'US Central',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'us-south',
			name: 'US South',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'singapore',
			name: 'Singapore',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'southafrica',
			name: 'South Africa',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'sydney',
			name: 'Sydney',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'europe',
			name: 'Europe',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'brazil',
			name: 'Brazil',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'hongkong',
			name: 'Hong Kong',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'russia',
			name: 'Russia',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'japan',
			name: 'Japan',
			optimal: false,
			deprecated: false,
			custom: false
		},
		{
			id: 'india',
			name: 'India',
			optimal: false,
			deprecated: false,
			custom: false
		}
	]
})
