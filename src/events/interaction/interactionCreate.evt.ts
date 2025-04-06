import { PinoLogger, RegisterEvent } from '@ddev';
import { REST, Routes, codeBlock } from 'discord.js';
import { autocomplete } from './autocomplete';

/** Removes a slash command */
async function removeSlashCommand(name: string, id: string, guildId?: string | null) {
	try {
		const rest = new REST().setToken(Bun.env.BOT_TOKEN);
		let data: any;
		if (guildId) {
			data = (await rest.delete(
				Routes.applicationGuildCommand(Bun.env.APPLICATION_ID, guildId, id)
			)) as any;
		} else {
			data = (await rest.delete(
				Routes.applicationCommand(Bun.env.APPLICATION_ID, id)
			)) as any;
		}
		if (data.length < 1) {
			PinoLogger.error(
				`Deleted command length from removing command "${name}" is inferior to 1 (${data.length})`
			);
		}
	} catch (err) {
		PinoLogger.error(`An error occured while removing slash command "${name}":`, err);
	}
}

RegisterEvent({
	name: 'interactionCreate',
	async listener(interaction) {
		if (interaction.isAutocomplete()) {
			await autocomplete(interaction);
			return;
		}
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) {
				await interaction.reply(
					codeBlock(`The command "${interaction.commandName}" wasn't found. Removing...`)
				);
				removeSlashCommand(
					interaction.commandName,
					interaction.commandId,
					interaction.commandGuildId
				).then(async () => {
					interaction.followUp({
						content: codeBlock(`"${interaction.commandName}" has been removed.`),
					});
				});
				return;
			}
			command.execute(interaction);
		}
	},
});
