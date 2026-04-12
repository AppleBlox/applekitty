import { PinoLogger, RegisterEvent } from '@ddev';
import { EmbedBuilder, type Message, type TextChannel } from 'discord.js';
import { getTags } from '../commands/tag/tags';
import { parseThemeColor } from '../style';

interface FAQClassification {
	tag: string;
	confidence: number;
	reason: string;
}

const CONFIDENCE_THRESHOLD = 0.85;
const MIN_MESSAGE_LENGTH = 15;
const MAX_MESSAGE_LENGTH = 600;

function getWhitelistedRoles(): Set<string> {
	if (!Bun.env.FAQ_CLASSIFIER_WHITELIST_ROLES) return new Set();
	return new Set(
		Bun.env.FAQ_CLASSIFIER_WHITELIST_ROLES.split(',')
			.map((r) => r.trim())
			.filter((r) => r.length > 0)
	);
}

function getAllowedChannels(): Set<string> {
	if (!Bun.env.FAQ_CLASSIFIER_CHANNELS) return new Set();
	return new Set(
		Bun.env.FAQ_CLASSIFIER_CHANNELS.split(',')
			.map((c) => c.trim())
			.filter((c) => c.length > 0)
	);
}

function isUserWhitelisted(message: Message): boolean {
	if (!message.member) return false;
	const whitelisted = getWhitelistedRoles();
	if (whitelisted.size === 0) return false;
	return message.member.roles.cache.some((role) => whitelisted.has(role.id));
}

function firstSentence(text: string): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	const match = clean.match(/^[^.!?\n]{1,200}[.!?]?/);
	return match ? match[0].trim() : clean.slice(0, 200);
}

let cachedSystemPrompt: string | null = null;
let cachedTagIds: Set<string> | null = null;

async function buildSystemPrompt(): Promise<{ prompt: string; tagIds: Set<string> }> {
	if (cachedSystemPrompt && cachedTagIds) {
		return { prompt: cachedSystemPrompt, tagIds: cachedTagIds };
	}

	const tags = await getTags();
	const tagIds = new Set(tags.map((t) => t.id));

	const tagDescriptions = tags
		.map((tag) => {
			const first = tag.embeds[0];
			const title = first?.title ?? tag.id;
			const desc = first?.description ? firstSentence(first.description) : '';
			return `- ${tag.id}: ${title}${desc ? ` — ${desc}` : ''}`;
		})
		.join('\n');

	const prompt = `You are a support classifier for the AppleBlox Discord. AppleBlox is a third-party Roblox launcher for macOS.

Given a user message, match it to ONE of the FAQ topics below if the message is CLEARLY asking about that exact topic. Otherwise return "none".

Available FAQ tags:
${tagDescriptions}

Hard rules:
1. Return "none" if the message is ambiguous, a statement (not a question), a reply to someone else, casual chat, or describes a bug not covered above.
2. Return "none" rather than guess. Silence is better than a wrong reply.
3. Only classify with confidence >= ${CONFIDENCE_THRESHOLD}. Below that, return "none".
4. Ignore code blocks, URLs, and @mentions when judging intent.

Respond ONLY with JSON matching the provided schema.`;

	cachedSystemPrompt = prompt;
	cachedTagIds = tagIds;
	return { prompt, tagIds };
}

async function classify(content: string): Promise<FAQClassification | null> {
	if (!Bun.env.OPENAI_API_KEY) return null;

	const { prompt, tagIds } = await buildSystemPrompt();

	try {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${Bun.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: prompt },
					{ role: 'user', content },
				],
				temperature: 0,
				max_tokens: 120,
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: 'faq_classification',
						strict: true,
						schema: {
							type: 'object',
							additionalProperties: false,
							required: ['tag', 'confidence', 'reason'],
							properties: {
								tag: { type: 'string' },
								confidence: { type: 'number' },
								reason: { type: 'string' },
							},
						},
					},
				},
			}),
		});

		if (!response.ok) {
			PinoLogger.error(`FAQ classifier API error: ${response.status} ${response.statusText}`);
			return null;
		}

		const data = await response.json();
		const raw = data.choices[0]?.message?.content?.trim();
		if (!raw) return null;

		const parsed = JSON.parse(raw) as FAQClassification;
		if (typeof parsed.tag !== 'string' || typeof parsed.confidence !== 'number') return null;
		if (parsed.tag !== 'none' && !tagIds.has(parsed.tag)) {
			PinoLogger.warn(`FAQ classifier returned unknown tag: ${parsed.tag}`);
			return { ...parsed, tag: 'none' };
		}
		return parsed;
	} catch (error: any) {
		PinoLogger.error(`FAQ classifier error: ${error.message ?? error}`);
		return null;
	}
}

async function logToChannel(message: Message, result: FAQClassification, wouldReply: boolean): Promise<void> {
	const logChannelId = Bun.env.FAQ_CLASSIFIER_LOG_CHANNEL_ID;
	if (!logChannelId) return;

	try {
		const channel = await message.client.channels.fetch(logChannelId);
		if (!channel?.isTextBased()) return;

		const color = wouldReply ? parseThemeColor('primary') : parseThemeColor('secondary');
		const content =
			message.content.length > 512 ? `${message.content.slice(0, 509)}...` : message.content || '*No text content*';

		const embed = new EmbedBuilder()
			.setTitle(wouldReply ? `[DRY-RUN] Would reply: ${result.tag}` : `[DRY-RUN] Skipped (${result.tag})`)
			.setColor(color)
			.addFields(
				{ name: 'Author', value: `<@${message.author.id}>`, inline: true },
				{ name: 'Channel', value: `<#${message.channelId}>`, inline: true },
				{ name: 'Confidence', value: `${(result.confidence * 100).toFixed(1)}%`, inline: true },
				{ name: 'Reason', value: result.reason || '*empty*' },
				{ name: 'Message', value: content }
			)
			.setURL(message.url)
			.setTimestamp(message.createdAt);

		await (channel as TextChannel).send({ embeds: [embed] });
	} catch (error: any) {
		PinoLogger.error(`FAQ classifier log failure: ${error.message ?? error}`);
	}
}

RegisterEvent({
	name: 'messageCreate',
	async listener(message: Message) {
		if (Bun.env.FAQ_CLASSIFIER_ENABLED !== 'true') return;
		if (message.author.bot) return;
		if (!message.inGuild()) return;

		const text = message.content.trim();
		if (text.length < MIN_MESSAGE_LENGTH || text.length > MAX_MESSAGE_LENGTH) return;

		const allowedChannels = getAllowedChannels();
		if (allowedChannels.size > 0 && !allowedChannels.has(message.channelId)) return;

		if (isUserWhitelisted(message)) return;

		const result = await classify(text);
		if (!result) return;

		const wouldReply = result.tag !== 'none' && result.confidence >= CONFIDENCE_THRESHOLD;

		PinoLogger.info(
			`[faq-classifier] ${message.author.tag} in #${message.channelId}: ` +
				`tag=${result.tag} conf=${result.confidence.toFixed(2)} wouldReply=${wouldReply} ` +
				`reason="${result.reason}"`
		);

		await logToChannel(message, result, wouldReply);
	},
});
