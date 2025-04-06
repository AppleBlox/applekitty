import { RegisterSlashCommand } from '@ddev';
import {
    type CacheType,
    type ChatInputCommandInteraction,
    EmbedBuilder,
    SlashCommandBuilder
} from 'discord.js';
import { ThemeColors } from '../../style';
import { getTags } from './tags';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('taglist')
		.setDescription('Returns a list of existing tags.'),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		const tags = await getTags();
		const content = tags.map((tag) => `\`${tag.id}\`: ${tag.embeds[0].title}`).join("\n");
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setTitle('List of tags')
					.setColor(ThemeColors.Primary)
					.setDescription(content),
			],
			flags: ['Ephemeral'],
		});
	},
});
