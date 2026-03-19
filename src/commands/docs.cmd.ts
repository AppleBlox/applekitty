import { RegisterSlashCommand } from '@ddev';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import { ThemeColors } from '../style';

interface DocPage {
	name: string;
	url: string;
	description: string;
}

const DOCS_BASE = 'https://docs.appleblox.com';

const DOC_PAGES: DocPage[] = [
	{ name: 'getting-started', url: `${DOCS_BASE}/guide/getting-started`, description: 'Installation and first launch' },
	{ name: 'launching-roblox', url: `${DOCS_BASE}/guide/launching-roblox`, description: 'How to launch Roblox through AppleBlox' },
	{ name: 'account-and-region', url: `${DOCS_BASE}/guide/account-and-region`, description: 'Account switching and region selection' },
	{ name: 'fastflags', url: `${DOCS_BASE}/guide/fastflags`, description: 'Managing FastFlags and profiles' },
	{ name: 'mods', url: `${DOCS_BASE}/guide/mods`, description: 'Installing and managing mods' },
	{ name: 'integrations', url: `${DOCS_BASE}/guide/integrations`, description: 'Discord Rich Presence and other integrations' },
	{ name: 'multi-instance', url: `${DOCS_BASE}/guide/multi-instance`, description: 'Running multiple Roblox instances' },
	{ name: 'appearance', url: `${DOCS_BASE}/guide/appearance`, description: 'Themes and bootstrapper customization' },
	{ name: 'troubleshooting', url: `${DOCS_BASE}/guide/troubleshooting`, description: 'Common issues and fixes' },
	{ name: 'faq', url: `${DOCS_BASE}/guide/faq`, description: 'Frequently asked questions' },
	{ name: 'engine-settings', url: `${DOCS_BASE}/guide/engine-settings`, description: 'Graphics and engine configuration' },
	{ name: 'behavior', url: `${DOCS_BASE}/guide/behavior`, description: 'Behavior settings and delegate launching' },
	{ name: 'system', url: `${DOCS_BASE}/guide/system`, description: 'System settings, logs, and debug tools' },
	{ name: 'changelog', url: `${DOCS_BASE}/changelog`, description: 'Release notes and version history' },
];

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('docs')
		.setDescription('Link to an AppleBlox documentation page')
		.addStringOption((option) =>
			option
				.setName('query')
				.setDescription('The documentation page to link')
				.setRequired(true)
				.setAutocomplete(true)
		),
	async execute(interaction: ChatInputCommandInteraction<CacheType>) {
		const query = interaction.options.getString('query')?.trim();
		if (!query) {
			await interaction.reply({ content: 'Please specify a documentation page.', flags: 'Ephemeral' });
			return;
		}

		const page = DOC_PAGES.find((p) => p.name === query);
		if (!page) {
			await interaction.reply({
				content: `Unknown docs page. Available: ${DOC_PAGES.map((p) => `\`${p.name}\``).join(', ')}`,
				flags: 'Ephemeral',
			});
			return;
		}

		const embed = new EmbedBuilder()
			.setTitle(`📖 ${page.name}`)
			.setDescription(`${page.description}\n\n**[Open documentation →](${page.url})**`)
			.setColor(ThemeColors.Primary)
			.setURL(page.url);

		await interaction.reply({ embeds: [embed] });
	},
	async autocomplete(interaction) {
		const focusedValue = interaction.options.getFocused().toLowerCase();
		const filtered = DOC_PAGES.filter(
			(p) => p.name.includes(focusedValue) || p.description.toLowerCase().includes(focusedValue)
		).slice(0, 25);
		await interaction.respond(
			filtered.map((p) => ({ name: `${p.name} — ${p.description}`, value: p.name }))
		);
	},
});
