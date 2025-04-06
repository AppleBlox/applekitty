import { PinoLogger, RegisterSlashCommand } from '@ddev';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from 'discord.js';
import { parseThemeColor } from '../../style';
import { getTags } from './tags';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('tag')
		.setDescription('Sends a pre-written help message in the current channel')
		.addStringOption((option) =>
			option
				.setName('name')
				.setDescription('The tag name')
				.setRequired(true)
				.setAutocomplete(true)
		),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		const tagName = interaction.options.getString('name')?.trim();
		if (!tagName) {
			PinoLogger.error(`Couldn't retrieve the "name" option for the "tag" command.`);
			return;
		}
		const tags = await getTags();
		const tag = tags.find((t) => t.id === tagName);
		if (!tag) {
			await interaction.reply({
				flags: ['Ephemeral'],
				content: `No tags exist with this name. List of tags:${tags.map((t) => `\n- ${t.id}`)}`,
			});
			return;
		}

		const formattedEmbeds = [];
		for (const embed of tag.embeds) {
			const newEmbed = new EmbedBuilder()
				.setTitle(embed.title)
				.setDescription(embed.description)
				.setColor(parseThemeColor(embed.color));
			if (embed.image) newEmbed.setImage(embed.image);
			if (embed.thumbnail) newEmbed.setThumbnail(embed.thumbnail);
			formattedEmbeds.push(newEmbed);
		}

		interaction.reply({ embeds: formattedEmbeds });
	},
	async autocomplete(interaction) {
		const focusedOption = interaction.options.getFocused(true);
		const choices = (await getTags()).map((tag) => ({ name: tag.id, value: tag.id }));
		const filtered = choices.filter((choice) =>
			choice.name.toLowerCase().startsWith(focusedOption.value.toLowerCase())
		);
		const results = filtered.slice(0, Math.min(25, filtered.length));
		await interaction.respond(results);
	},
});
