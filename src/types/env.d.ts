declare namespace NodeJS {
	export interface ProcessEnv {
		// biome-ignore lint: Constant
		BOT_TOKEN: string;
		// biome-ignore lint: Constant
		APPLICATION_ID: number | string;
	}
}
