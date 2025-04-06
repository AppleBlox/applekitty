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

// RegisterSlashCommand({
// 	data: new SlashCommandBuilder().setName('balls3').setDescription('caca'),
// 	async execute(interaction) {
// 		await interaction.reply(
// 			`Reply in \`${Math.abs(Date.now() - interaction.createdTimestamp)}ms\`.`
// 		);
// 	},
// 	options: {
// 		guilds: ['1263512148450082837'],
// 	},
// });
