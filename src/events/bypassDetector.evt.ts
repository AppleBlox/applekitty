import { PinoLogger, RegisterEvent } from '@ddev';
import { EmbedBuilder, type Message, type TextChannel } from 'discord.js';
import { parseThemeColor } from '../style';

// Keywords that trigger message deletion
const DELETE_KEYWORDS = [
	'ixp',
	'~/library/roblox',
	'/library/roblox',
	'roblox cache',
	'modify cache',
	'edit cache',
	'cache bypass',
	'fps unlock',
	'bypass restrictions',
	'bypass whitelist',
	'bypass fastflag',
	'fastflag bypass',
	'flag bypass',
];

// Keywords that trigger a warning reply only
const REPLY_KEYWORDS = [
	'/users/',
	'fps unlocker',
	'unlock fps',
	'clientsettings',
	'clientappsettings',
];

interface AIClassification {
	shouldDelete: boolean;
	shouldReply: boolean;
	confidence: number;
}

async function classifyWithAI(content: string): Promise<AIClassification | null> {
	// Check if OpenAI API key is available
	if (!Bun.env.OPENAI_API_KEY) {
		return null;
	}

	try {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${Bun.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{
						role: 'system',
						content: 'You are a content moderation assistant for a Discord server about AppleBlox (a Roblox mod manager). Your job is to detect if messages discuss bypassing Roblox FastFlag restrictions or modifying Roblox cache files to unlock FPS or bypass restrictions. Respond ONLY with a JSON object in this format: {"action": "delete"|"reply"|"none", "confidence": 0.0-1.0}. Use "delete" for messages directly instructing how to bypass restrictions or modify cache. Use "reply" for messages mentioning FPS unlockers or client settings without direct bypass instructions. Use "none" if the message is unrelated.',
					},
					{
						role: 'user',
						content: content,
					},
				],
				temperature: 0.1,
				max_tokens: 50,
			}),
		});

		if (!response.ok) {
			PinoLogger.error(`OpenAI API error: ${response.status} ${response.statusText}`);
			return null;
		}

		const data = await response.json();
		const aiResponse = data.choices[0]?.message?.content?.trim();

		if (!aiResponse) {
			return null;
		}

		// Parse JSON response
		const result = JSON.parse(aiResponse);
		
		return {
			shouldDelete: result.action === 'delete',
			shouldReply: result.action === 'reply',
			confidence: result.confidence || 0,
		};
	} catch (error: any) {
		PinoLogger.error(`AI classification error: ${error.message ?? error}`);
		return null;
	}
}

function checkKeywords(content: string): { shouldDelete: boolean; shouldReply: boolean } {
	const lowerContent = content.toLowerCase();
	
	const shouldDelete = DELETE_KEYWORDS.some(keyword => lowerContent.includes(keyword));
	const shouldReply = REPLY_KEYWORDS.some(keyword => lowerContent.includes(keyword));
	
	return { shouldDelete, shouldReply };
}

async function logDeletedMessage(
	message: Message,
	detectionMethod: string,
	confidence?: number
): Promise<void> {
	if (!Bun.env.BYPASS_LOG_CHANNEL_ID) {
		return;
	}

	try {
		const logChannel = await message.client.channels.fetch(Bun.env.BYPASS_LOG_CHANNEL_ID);
		
		if (!logChannel || !logChannel.isTextBased()) {
			PinoLogger.error('Bypass log channel not found or not a text channel');
			return;
		}

		const logEmbed = new EmbedBuilder()
			.setTitle('🚫 Message Deleted - Bypass Content')
			.setColor(parseThemeColor('error'))
			.addFields(
				{ name: 'Author', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
				{ name: 'Author ID', value: message.author.id, inline: true },
				{ name: 'Channel', value: `<#${message.channelId}>`, inline: true },
				{ name: 'Message ID', value: message.id, inline: true },
				{ name: 'Detection Method', value: detectionMethod, inline: true },
				{ name: 'Timestamp', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: true },
			);

		if (confidence !== undefined) {
			logEmbed.addFields({ name: 'AI Confidence', value: `${(confidence * 100).toFixed(1)}%`, inline: true });
		}

		// Add message content (truncated if too long)
		const content = message.content.length > 1024 
        //biome-ignore lint:
			? message.content.substring(0, 1021) + '...' 
			: message.content;
		logEmbed.addFields({ name: 'Content', value: content || '*No text content*' });

		// Add reply information if applicable
		if (message.reference?.messageId) {
			try {
				const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
				logEmbed.addFields({
					name: 'Replying To',
					value: `<@${repliedMessage.author.id}> (${repliedMessage.author.tag})`,
				});
			} catch {
				logEmbed.addFields({ name: 'Replying To', value: 'Unable to fetch replied message' });
			}
		}

		// Add attachments info
		if (message.attachments.size > 0) {
			const attachmentList = message.attachments.map(att => att.url).join('\n');
			logEmbed.addFields({ name: 'Attachments', value: attachmentList });
		}

		await (logChannel as TextChannel).send({ embeds: [logEmbed] });
	} catch (error: any) {
		PinoLogger.error(`Failed to log deleted message: ${error.message ?? error}`);
	}
}

RegisterEvent({
	name: 'messageCreate',
	async listener(message: Message) {
		// Ignore bot messages
		if (message.author.bot) return;

		// Skip if message is too short (likely not bypass-related)
		if (message.content.length < 10) return;

		// First check with keyword matching (fast)
		const keywordResult = checkKeywords(message.content);

		// If keywords didn't match, try AI classification (slower but more accurate)
		let aiResult: AIClassification | null = null;
		if (!keywordResult.shouldDelete && !keywordResult.shouldReply) {
			aiResult = await classifyWithAI(message.content);
		}

		// Determine final action
		const shouldDelete = keywordResult.shouldDelete || (aiResult?.shouldDelete && aiResult.confidence > 0.7);
		const shouldReply = keywordResult.shouldReply || (aiResult?.shouldReply && aiResult.confidence > 0.7);

		// If neither action needed, return
		if (!shouldDelete && !shouldReply) return;

		// Log detection method
		const detectionMethod = keywordResult.shouldDelete || keywordResult.shouldReply ? 'keyword' : 'AI';
		PinoLogger.info(
            // biome-ignore lint:
			`Detected bypass content from ${message.author.tag} via ${detectionMethod}` +
			(aiResult ? ` (confidence: ${aiResult.confidence.toFixed(2)})` : '')
		);

		try {
			if (shouldDelete) {
				// Prepare mentions
				let mentions = `<@${message.author.id}>`;
				
				// If replying to someone, mention them too
				if (message.reference?.messageId) {
					try {
						const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
						if (repliedMessage && !repliedMessage.author.bot) {
							mentions += ` <@${repliedMessage.author.id}>`;
						}
					} catch (error) {
						PinoLogger.warn(`Could not fetch replied message: ${error}`);
					}
				}

				// Log the deleted message before deletion
				await logDeletedMessage(message, detectionMethod, aiResult?.confidence);

				// Delete the message
				await message.delete();
				PinoLogger.info(
					`Deleted message from ${message.author.tag} (${message.author.id}) containing bypass content`
				);

				// Send warning embed with mentions
				const warningEmbed = new EmbedBuilder()
					.setTitle('Removal of most fast flags')
					.setDescription(
						'Roblox has implemented a whitelist system that restricts which fast flags can be modified. ' +
						'As a result, many engine settings (including frame rate caps, lighting technology, and others) ' +
						'are no longer configurable. Custom flag profiles may also be affected. Please do not create ' +
						'GitHub issues or Discord support threads about this limitation—it\'s a Roblox-side restriction ' +
						'that cannot be bypassed.\n\n' +
						'Please also note that some methods of bypassing those restrictions exist, but they **will get you banned** ' +
						'(not instantly, but in the next banwave). **The message has been removed because it contained ' +
						'information about bypassing these restrictions, which is a punishable offense by Roblox.**'
					)
					.setColor(parseThemeColor('error'))
					.setImage(
						'https://cdn.discordapp.com/attachments/1267176008323432539/1424421699134160977/image.png?ex=68e3e395&is=68e29215&hm=d28aadc868ed8dd3a0b48fa8362481aec086ccd25b247758b4d2145d7433e52a&'
					);

				if (message.channel.isSendable()) {
					await message.channel.send({ 
						content: mentions,
						embeds: [warningEmbed] 
					});
				}
			} else if (shouldReply) {
				// Just reply to the message
				const replyEmbed = new EmbedBuilder()
					.setTitle('Removal of most fast flags')
					.setDescription(
						'Roblox has implemented a whitelist system that restricts which fast flags can be modified. ' +
						'As a result, many engine settings (including frame rate caps, lighting technology, and others) ' +
						'are no longer configurable. Custom flag profiles may also be affected. Please do not create ' +
						'GitHub issues or Discord support threads about this limitation—it\'s a Roblox-side restriction ' +
						'that cannot be bypassed.\n\n' +
						'Please also note that some methods of bypassing those restrictions exist, but they **will get you banned** ' +
						'(not instantly, but in the next banwave).'
					)
					.setColor(parseThemeColor('warning'))
					.setImage(
						'https://cdn.discordapp.com/attachments/1267176008323432539/1424421699134160977/image.png?ex=68e3e395&is=68e29215&hm=d28aadc868ed8dd3a0b48fa8362481aec086ccd25b247758b4d2145d7433e52a&'
					);

				await message.reply({ embeds: [replyEmbed] });
				PinoLogger.info(
					`Replied to message from ${message.author.tag} (${message.author.id}) with bypass warning`
				);
			}
		} catch (error: any) {
			PinoLogger.error(
				`Failed to handle bypass message from ${message.author.tag}: ${error.message ?? error}`
			);
		}
	},
});