import { RegisterSlashCommand } from '@ddev';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type Message,
} from 'discord.js';

// Keywords to detect FPS unlock/bypass attempts
const BYPASS_KEYWORDS = [
	'ixp',
	'~/library/roblox',
	'/users/',
	'/library/roblox',
	'roblox cache',
	'modify cache',
	'edit cache',
	'cache bypass',
	'fps unlocker',
	'fps unlock',
	'unlock fps',
	'bypass restrictions',
	'bypass whitelist',
	'bypass fastflag',
	'fastflag bypass',
	'flag bypass',
	'clientsettings',
	'clientappsettings',
];

export function containsBypassKeywords(content: string): boolean {
	const lowerContent = content.toLowerCase();
	return BYPASS_KEYWORDS.some(keyword => lowerContent.includes(keyword));
}

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('purge-bypass')
		.setDescription('Removes all messages containing FPS unlock/bypass keywords in this channel')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
		.addIntegerOption(option =>
			option
				.setName('limit')
				.setDescription('Number of messages to scan (max 100)')
				.setMinValue(1)
				.setMaxValue(100)
				.setRequired(false)
		),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		await interaction.deferReply({ flags: 'Ephemeral' });

		if (!interaction.channel?.isSendable()) {
			await interaction.editReply('Cannot access this channel.');
			return;
		}

		const limit = interaction.options.getInteger('limit') ?? 100;

		try {
			const messages = await interaction.channel.messages.fetch({ limit });
			const messagesToDelete: Message[] = [];

			for (const [_, message] of messages) {
				if (containsBypassKeywords(message.content)) {
					messagesToDelete.push(message);
				}
			}

			if (messagesToDelete.length === 0) {
				await interaction.editReply('No messages found containing bypass keywords.');
				return;
			}

			// Delete messages
			let deletedCount = 0;
			for (const message of messagesToDelete) {
				try {
					await message.delete();
					deletedCount++;
				} catch (error) {
					console.error(`Failed to delete message ${message.id}:`, error);
				}
			}

			await interaction.editReply(
				`Successfully removed ${deletedCount} message(s) containing FPS unlock/bypass keywords.`
			);
		} catch (error: any) {
			await interaction.editReply(
				`Error scanning messages: ${error.message ?? 'Unknown error occurred.'}`
			);
		}
	},
});