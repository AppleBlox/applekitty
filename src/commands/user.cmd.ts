import { RegisterSlashCommand } from '@ddev';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from 'discord.js';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('user_command')
		.setDescription('A user app test command')
		.setContexts(
			InteractionContextType.Guild,
			InteractionContextType.BotDM,
			InteractionContextType.PrivateChannel
		),
	execute(interaction: ChatInputCommandInteraction<CacheType>) {
		interaction.reply({ content: 'Hello world!', flags: ["Ephemeral"] });
	},
});
