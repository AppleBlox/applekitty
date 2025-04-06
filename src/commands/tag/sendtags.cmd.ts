import { PinoLogger, RegisterSlashCommand } from '@ddev';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	codeBlock,
} from 'discord.js';
import { ThemeColors, parseThemeColor } from '../../style';
import { getTags } from './tags';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('sendtags')
		.setDescription('Sends every tag')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		if (!interaction.channel?.isSendable()) {
			interaction.reply({
				flags: ['Ephemeral'],
				content: 'Cannot send messages in this channel.',
			});
			return;
		}
		const tags = await getTags();
		for (const tag of tags) {
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

			interaction.channel.send({ embeds: formattedEmbeds });
		}
	},
});
