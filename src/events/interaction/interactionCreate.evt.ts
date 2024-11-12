import { PinoLogger, RegisterEvent } from '@ddev';
import { REST, Routes, codeBlock } from 'discord.js';

RegisterEvent({
	name: 'interactionCreate',
	async listener(interaction) {
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) {
				interaction.reply(
					codeBlock(`The command "${interaction.commandName}" wasn't found.`)
				);
				return;
			}

			// Remove outdated guild commands
			if (!interaction.guild) PinoLogger.warn('interaction.guild is undefined!');
			if (
				command.options?.guilds &&
				interaction.guild &&
				!command.options?.guilds?.includes(interaction.guild.id)
			) {
				console.log(interaction.commandName);
				try {
					const rest = new REST().setToken(Bun.env.BOT_TOKEN);
					await rest.delete(
						Routes.applicationGuildCommand(
							Bun.env.APPLICATION_ID.toString(),
							interaction.guild.id,
							interaction.commandId
						)
					);
					PinoLogger.info(
						`Deleted outdated "${interaction.commandName}" (${interaction.commandId}) in "${interaction.guild.name}" (${interaction.guild.id}) guild.`
					);
					await interaction.followUp({
						ephemeral: true,
						content: codeBlock(
							'Removed the command. It is now unusable in this guild.'
						),
					});
				} catch (err) {
					PinoLogger.error(
						'An error occured while deleting outdated guild command:',
						err
					);
					await interaction.reply({
						ephemeral: true,
						content: codeBlock(
							`Couldn't remove command due to an unexpected error:\n${codeBlock(err as string)}`
						),
					});
				}
			}
			command.execute(interaction);
		}
	},
});
