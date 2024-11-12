import { RegisterSlashCommand } from '@ddev';
import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('user_command')
		.setDescription('A user app test command')
		.setContexts(
			InteractionContextType.Guild,
			InteractionContextType.BotDM,
			InteractionContextType.PrivateChannel
		),
	execute(interaction) {
		interaction.reply({ content: 'Hello world!', ephemeral: true });
	},
});
