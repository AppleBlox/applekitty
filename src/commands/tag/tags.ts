import type { ColorResolvable } from 'discord.js';
import { load } from 'js-yaml';
import TagsFile from './tags.yaml' with { type: 'file' };

export interface Tag {
	embeds: {
		color: ColorResolvable;
		title: string;
		description: string;
		image?: string;
		thumbnail?: string;
	}[];
	id: string;
}

function validateTag(tag: unknown): tag is Tag {
	if (!tag || typeof tag !== 'object') return false;

	const { id, embeds } = tag as Tag;

	// Check if id exists and is string
	if (!id || typeof id !== 'string') return false;

	// Check if embeds is an array
	if (!Array.isArray(embeds)) return false;

	// Validate each embed
	return embeds.every((embed) => {
		if (typeof embed !== 'object') return false;

		const { color, title, description, image, thumbnail } = embed;

		// Required fields
		if (typeof color !== 'string') return false;
		if (typeof title !== 'string') return false;
		if (typeof description !== 'string') return false;

		// Optional fields
		if (image !== undefined && typeof image !== 'string') return false;
		if (thumbnail !== undefined && typeof thumbnail !== 'string') return false;

		return true;
	});
}

let tags: Tag[] | null = null;
export async function getTags(): Promise<Tag[]> {
	if (tags) return tags;

	try {
		const tagsFileContent = await Bun.file(TagsFile).text();
		const parsed = load(tagsFileContent) as unknown;

		// Check if parsed content is an array
		if (!Array.isArray(parsed)) {
			throw new Error('Tags file must contain an array of tags');
		}

		// Validate each tag
		const validTags = parsed.every((tag) => validateTag(tag));
		if (!validTags) {
			throw new Error('Invalid tag format found in tags file');
		}

		// If validation passes, we can safely cast
		tags = parsed as Tag[];
		return tags;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to parse tags file: ${error.message}`);
		}
		throw new Error('Failed to parse tags file');
	}
}
