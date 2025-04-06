import type { ColorResolvable } from 'discord.js';

/** ThemeConfig types */
export interface ThemeConfig {
	primary: ColorResolvable;
	secondary: ColorResolvable;
	success: ColorResolvable;
	warning: ColorResolvable;
	error: ColorResolvable;
	invisible: ColorResolvable;
}

/** The config for the Bot's theme */
export const THEME_CONFIG: ThemeConfig = {
	primary: '#592B2B',
	secondary: '#946060',
	success: '#23C45E',
	warning: '#FB933D',
	error: '#F04444',
	invisible: '#36393F',
};

/** Pre-defined colors enum */
export const ThemeColors = {
	// biome-ignore lint: Enum
	Primary: THEME_CONFIG.primary,
	// biome-ignore lint: Enum
	Secondary: THEME_CONFIG.secondary,
	// biome-ignore lint: Enum
	Success: THEME_CONFIG.success,
	// biome-ignore lint: Enum
	Warning: THEME_CONFIG.warning,
	// biome-ignore lint: Enum
	Error: THEME_CONFIG.error,
	// biome-ignore lint: Enum
	Invisible: THEME_CONFIG.invisible,
} as const;

/** Function to return a color based on its name. Returns the string passed if doesn't exist */
export function parseThemeColor(name: string | ColorResolvable): ColorResolvable {
	const color = name.toString().trim().toLowerCase();
	const parsedColor =
		Object.entries(THEME_CONFIG).find((entry) => entry[0].toLowerCase() === color)?.[1] || name;
	return parsedColor;
}
