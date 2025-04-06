import { RegisterSlashCommand } from '@ddev';
import { type CacheType, type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription("Replies with the bot's latency"),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		await interaction.reply(
			`Reply in \`${Math.abs(Date.now() - interaction.createdTimestamp)}ms\`.`
		);
	},
});
