import { PinoLogger } from '@ddev';
import type { AutocompleteInteraction } from 'discord.js';

export async function autocomplete(interaction: AutocompleteInteraction) {
	const command = interaction.client.commands.get(interaction.commandName);
	if (!command) {
		PinoLogger.warn(
			`Autocompletion requested for the command "${interaction.commandName}" but it wasn't found.`
		);
		return;
	}
	if (
		!('autocomplete' in command) ||
		('autocomplete' in command && typeof command.autocomplete !== 'function')
	) {
		PinoLogger.error(`The command "${interaction.commandName}" doesn't handle autocompletion!`);
		return;
	}
	// @ts-expect-error: Checks are made above to prevent command.autocomplete from being undefined
	await command.autocomplete(interaction);
	return;
}
