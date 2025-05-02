import { PinoLogger, RegisterSlashCommand } from '@ddev';
import {
	ActionRowBuilder,
	ApplicationCommandType,
	ButtonBuilder,
	ButtonStyle,
	type CacheType,
	type ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
	Message,
	MessageContextMenuCommandInteraction,
	SlashCommandBuilder,
	UserSelectMenuBuilder,
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
				flags: 'Ephemeral',
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
				flags: 'Ephemeral',
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

		// Create a user select menu for mentioning
		const userSelect = new UserSelectMenuBuilder()
			.setCustomId('user-mention')
			.setPlaceholder('Select a user to mention')
			.setMaxValues(1);

		// Create a send button without mentioning
		const sendWithoutMentionButton = new ButtonBuilder()
			.setCustomId('send-without-mention')
			.setLabel('Send without mention')
			.setStyle(ButtonStyle.Primary);

		// Create action row with components
		const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);
		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			sendWithoutMentionButton
		);

		// Send ephemeral message with components
		await interaction.reply({
			content: 'Select a user to mention or send without mention:',
			components: [row, buttonRow],
			flags: 'Ephemeral',
		});

		try {
			// Wait for interaction response (button click or user select)
			const componentInteraction = await interaction.channel.awaitMessageComponent({
				filter: (i) =>
					i.user.id === interaction.user.id &&
					(i.customId === 'user-mention' || i.customId === 'send-without-mention'),
				time: 60000, // 1 minute timeout
			});

			let userToMention = null;

			if (
				componentInteraction.customId === 'user-mention' &&
				componentInteraction.isUserSelectMenu()
			) {
				// Get the selected user
				const userId = componentInteraction.values[0];
				userToMention = `<@${userId}>`;
				await componentInteraction.update({
					content: `You selected to mention <@${userId}>. Sending message...`,
					components: [],
				});
			} else if (componentInteraction.customId === 'send-without-mention') {
				await componentInteraction.update({
					content: 'Sending message without mention...',
					components: [],
				});
			}

			// Prepare the message content
			const messageContent = userToMention
				? { content: userToMention, embeds: formattedEmbeds }
				: { embeds: formattedEmbeds };

			if (shouldReply) {
				try {
					// Fetch recent messages
					const messages = await interaction.channel.messages.fetch({ limit: 5 });
					// Filter out bot messages and find the most recent non-bot message
					const targetMessage = messages
						.filter(
							(msg) =>
								!msg.author.bot &&
								msg.createdTimestamp < interaction.createdTimestamp
						)
						.first();

					if (targetMessage) {
						// Reply to the message
						await targetMessage.reply(messageContent);
						await interaction.editReply({
							content: `Tag sent as a reply to ${targetMessage.author.username}'s message.`,
							components: [],
						});
					} else {
						// No suitable message found, send as normal
						await interaction.channel.send(messageContent);
						await interaction.editReply({
							content:
								"Couldn't find a recent message to reply to. Tag sent as a normal message.",
							components: [],
						});
					}
				} catch (error) {
					PinoLogger.error(`Error replying to message: ${error}`);
					await interaction.channel.send(messageContent);
					await interaction.editReply({
						content: 'Error while trying to reply. Tag sent as a normal message.',
						components: [],
					});
				}
			} else {
				// Regular behavior - send the embed to the channel
				await interaction.channel.send(messageContent);
				await interaction.editReply({
					content: 'Tag sent successfully!',
					components: [],
				});
			}
		} catch (error: any) {
			// Handle timeout or other errors
			if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
				await interaction.editReply({
					content: 'Selection timed out. Please try again.',
					components: [],
				});
			} else {
				PinoLogger.error(`Error handling component interaction: ${error}`);
				await interaction.editReply({
					content: 'An error occurred while processing your selection.',
					components: [],
				});
			}
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
