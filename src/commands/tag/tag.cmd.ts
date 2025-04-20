import { PinoLogger, RegisterSlashCommand } from '@ddev';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
	ApplicationCommandType,
	Message,
	MessageContextMenuCommandInteraction,
} from 'discord.js';
import { parseThemeColor } from '../../style';
import { getTags } from './tags';

// Register the slash command version
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
		)
		.addBooleanOption((option) =>
			option
				.setName('reply')
				.setDescription('Reply to the most recent message')
				.setRequired(false)
		),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		if (!interaction.channel?.isSendable()) {
			await interaction.reply({
				content: 'This channel is not sendable.',
				flags: ['Ephemeral'],
			});
			return;
		}
		
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

		// Check if the user wants to reply to the most recent message
		const shouldReply = interaction.options.getBoolean('reply') || false;
		
		if (shouldReply) {
			// Fetch the most recent message (that isn't the slash command)
			try {
				await interaction.deferReply({ ephemeral: true });
				
				const messages = await interaction.channel.messages.fetch({ limit: 5 });
				// Filter out bot messages and find the most recent non-bot message
				// that was sent before this interaction
				const targetMessage = messages
					.filter(msg => !msg.author.bot && msg.createdTimestamp < interaction.createdTimestamp)
					.first();
				
				if (targetMessage) {
					// Reply to the message
					await targetMessage.reply({ embeds: formattedEmbeds });
					await interaction.editReply({ content: `Tag sent as a reply to ${targetMessage.author.username}'s message.` });
				} else {
					// No suitable message found, send as normal
					await interaction.channel.send({ embeds: formattedEmbeds });
					await interaction.editReply({ content: "Couldn't find a recent message to reply to. Tag sent as a normal message." });
				}
			} catch (error) {
				PinoLogger.error(`Error replying to message: ${error}`);
				await interaction.channel.send({ embeds: formattedEmbeds });
				await interaction.editReply({ content: "Error while trying to reply. Tag sent as a normal message." });
			}
		} else {
			// Regular behavior - send the embed to the channel
			await interaction.channel.send({ embeds: formattedEmbeds });
			await interaction.deferReply();
			await interaction.deleteReply();
		}
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