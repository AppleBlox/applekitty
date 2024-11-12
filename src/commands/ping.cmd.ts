import { RegisterSlashCommand } from '@ddev';
import { SlashCommandBuilder } from 'discord.js';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription("Replies with the bot's latency"),
	async execute(interaction) {
		await interaction.reply(
			`Reply in \`${Math.abs(Date.now() - interaction.createdTimestamp)}ms\`.`
		);
	},
});
