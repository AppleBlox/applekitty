import fs from 'node:fs/promises';
import path from 'node:path';
import { PinoLogger, RegisterSlashCommand } from '@ddev';
import AdmZip from 'adm-zip';
import { $ } from 'bun';
import {
	ApplicationCommandType,
	AttachmentBuilder,
	ContextMenuCommandBuilder,
	type ContextMenuCommandInteraction,
	EmbedBuilder,
	InteractionContextType,
} from 'discord.js';
import { ThemeColors } from '../../style';

RegisterSlashCommand({
	data: new ContextMenuCommandBuilder()
		.setName('Analyze AppleBlox config')
		.setContexts(InteractionContextType.Guild)
		.setType(ApplicationCommandType.Message),
	async execute(interaction: ContextMenuCommandInteraction) {
		const log = PinoLogger.child(
			{},
			{ msgPrefix: `[analyze: ${interaction.member?.user.id}] ` }
		);
		await interaction.deferReply();
		const message = await interaction.channel?.messages.fetch(interaction.targetId);
		if (!message) {
			await interaction.editReply("Couldn't get message.");
			return;
		}
		const attachment = message.attachments.find((attachment) =>
			attachment.name?.endsWith('.zip')
		);
		if (!attachment) {
			await interaction.editReply('No .zip file found in the message.');
			return;
		}

		try {
			await $`rm -rf .zips`;
			await $`mkdir -p .zips`;

			const zipUrl = attachment.url;
			const zipFileName = attachment.name || 'download.zip';
			const currentDir = process.cwd();
			const zipFilePath = path.join(currentDir, '.zips', zipFileName);
			const extractPath = path.join(
				currentDir,
				'.zips',
				`extracted_${zipFileName.replace('.zip', '')}`
			);

			log.info(`Downloading from ${zipUrl}...`);

			// Download the file
			const response = await fetch(zipUrl);
			if (!response.ok) {
				throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
			}

			// Get file as ArrayBuffer and save it
			const arrayBuffer = await response.arrayBuffer();
			await Bun.write(zipFilePath, new Uint8Array(arrayBuffer));

			log.info(`ZIP file saved to ${zipFilePath}`);

			// Create extraction directory
			await fs.mkdir(extractPath, { recursive: true });

			// Extract the ZIP file using adm-zip (cross-platform)
			log.info(`Extracting to ${extractPath}...`);
			const zip = new AdmZip(zipFilePath);
			zip.extractAllTo(extractPath, true); // true for overwrite

			log.info(`Successfully extracted to ${extractPath}`);

			// List files in extracted directory
			const extractedFiles = await fs.readdir(extractPath);
			log.info('Extracted files:', extractedFiles);

			// First parse log files to extract debug info
			const { debugInfo, logErrors } = await analyzeLogFiles(extractPath, log);

			// Merge config files
			const mergedConfig = await mergeConfigFiles(extractPath, log);

			// Create main embed
			const mainEmbed = new EmbedBuilder()
				.setTitle(`AppleBlox Config Analysis: ${zipFileName}`)
				.setDescription(`Analysis completed at <t:${Math.floor(Date.now() / 1000)}:F>`)
				.setColor(logErrors.length > 0 ? ThemeColors.Error : ThemeColors.Success);

			// Add debug info if available
			if (debugInfo && Object.keys(debugInfo).length > 0) {
				const debugInfoText = formatDebugInfo(debugInfo);
				mainEmbed.addFields({
					name: '📊 System Information',
					value: `\`\`\`\n${debugInfoText}\n\`\`\``,
				});
			}

			// Format error information
			if (logErrors.length > 0) {
				const errorCount = logErrors.length;
				mainEmbed.addFields({
					name: `⚠️ Errors Found (${errorCount})`,
					value: `Found ${errorCount} error${errorCount === 1 ? '' : 's'} in the logs.`,
				});

				// Create error embeds - using a faded red color
				const errorEmbed = new EmbedBuilder()
					.setTitle('Error Details')
					.setColor(ThemeColors.Error);

				// Format each error for the embed
				const errorBlocks = logErrors
					.slice(0, 5)
					.map((error, index) => `**Error ${index + 1}**\n\`\`\`\n${error}\n\`\`\``)
					.join('\n');

				errorEmbed.setDescription(errorBlocks);

				if (errorCount > 5) {
					errorEmbed.setFooter({
						text: `${errorCount - 5} more error${errorCount - 5 === 1 ? '' : 's'} not shown`,
					});
				}

				// Handle config as file attachment if it exists
				if (mergedConfig) {
					// Create a JSON file from the merged config
					const configJson = JSON.stringify(mergedConfig, null, 2);
					const configFilePath = path.join(currentDir, '.zips', 'merged_config.json');
					await fs.writeFile(configFilePath, configJson, 'utf-8');

					// Create an attachment from the file
					const configAttachment = new AttachmentBuilder(configFilePath, {
						name: `appleblox-config-${new Date().toISOString().slice(0, 10)}.json`,
						description: 'Merged AppleBlox Configuration',
					});

					// Send the embeds with the attachment
					await interaction.editReply({
						embeds: [mainEmbed, errorEmbed],
						files: [configAttachment],
					});
				} else {
					// No config, just send main and error embeds
					await interaction.editReply({ embeds: [mainEmbed, errorEmbed] });
				}
			} else {
				// No errors
				mainEmbed.addFields({
					name: '✅ No Errors Found',
					value: 'No errors detected in the logs',
				});

				// Handle config as file attachment if it exists
				if (mergedConfig) {
					// Create a JSON file from the merged config
					const configJson = JSON.stringify(mergedConfig, null, 2);
					const configFilePath = path.join(currentDir, '.zips', 'merged_config.json');
					await fs.writeFile(configFilePath, configJson, 'utf-8');

					// Create an attachment from the file
					const configAttachment = new AttachmentBuilder(configFilePath, {
						name: `appleblox-config-${new Date().toISOString().slice(0, 10)}.json`,
						description: 'Merged AppleBlox Configuration',
					});

					// Create a simple embed to explain the attachment
					const configEmbed = new EmbedBuilder()
						.setTitle('Configuration')
						.setColor(ThemeColors.Primary)
						.setDescription('The merged configuration is attached as a JSON file.');

					// Send the embeds with the attachment
					await interaction.editReply({
						embeds: [mainEmbed, configEmbed],
						files: [configAttachment],
					});
				} else {
					// No config, just send main embed with note
					const noConfigEmbed = new EmbedBuilder()
						.setTitle('Configuration')
						.setColor(ThemeColors.Primary)
						.setDescription('No configuration files found to merge.');

					await interaction.editReply({ embeds: [mainEmbed, noConfigEmbed] });
				}
			}
		} catch (error: any) {
			log.error(`Error processing ZIP file: ${error}`);
			await interaction.editReply(`Error processing ZIP file: ${error.message}`);
		}
	},
});

/**
 * Analyzes log files to extract both errors and debug information
 */
async function analyzeLogFiles(
	extractPath: string,
	logger: any
): Promise<{ debugInfo: any; logErrors: string[] }> {
	const errors: string[] = [];
	const debugInfo: any = {};

	try {
		const logsPath = path.join(extractPath, 'logs');
		const logsFolderExists = await fileExists(logsPath);

		if (!logsFolderExists) {
			logger.info('No logs folder found');

			// Try to find log files in the root directory
			const files = await fs.readdir(extractPath);
			const logFiles = files.filter((file) => file.endsWith('.log'));

			for (const logFile of logFiles) {
				const logFilePath = path.join(extractPath, logFile);
				const logContent = await fs.readFile(logFilePath, 'utf-8');

				// Extract errors from log file
				const fileErrors = extractErrorsFromLog(logContent, logFile);
				errors.push(...fileErrors);

				// Extract debug info
				const fileDebugInfo = extractDebugInfoFromLog(logContent);
				Object.assign(debugInfo, fileDebugInfo);
			}

			return { debugInfo, logErrors: errors };
		}

		// Process all log files in the logs directory
		const logFiles = await fs.readdir(logsPath);

		for (const logFile of logFiles) {
			if (!logFile.endsWith('.log')) continue;

			const logFilePath = path.join(logsPath, logFile);
			const logContent = await fs.readFile(logFilePath, 'utf-8');

			// Extract errors from log file
			const fileErrors = extractErrorsFromLog(logContent, logFile);
			errors.push(...fileErrors);

			// Extract debug info
			const fileDebugInfo = extractDebugInfoFromLog(logContent);
			Object.assign(debugInfo, fileDebugInfo);
		}
	} catch (error) {
		logger.error(`Error analyzing log files: ${error}`);
	}

	return { debugInfo, logErrors: errors };
}

/**
 * Extracts error messages from a log file's content
 */
function extractErrorsFromLog(logContent: string, fileName: string): string[] {
	const errors: string[] = [];

	// Look for common error patterns
	const errorPatterns = [
		/\b(?:error|err)\b/i,
		/\b(?:exception|exc)\b/i,
		/\b(?:fail|failure)\b/i,
		/Cannot perform/i,
		/could not/i,
		/\{\"code\"\:\"NE_/i, // Neutralino errors
		/Error while/i,
	];

	// Split into lines and analyze each line
	const lines = logContent.split('\n');

	for (const line of lines) {
		// Skip empty lines
		if (!line.trim()) continue;

		// Check if line matches any error pattern
		const isError = errorPatterns.some((pattern) => pattern.test(line));

		if (isError) {
			// Extract timestamp if available
			const timestamp = line.match(/\[(.*?)\]/)?.[1] || '';
			const errorMessage = line.trim();

			// Format error with file name and timestamp using template literals
			errors.push(`${fileName}${timestamp ? ` [${timestamp}]` : ''}: ${errorMessage}`);
		}
	}

	return errors;
}

/**
 * Extracts debug information from a log file
 */
function extractDebugInfoFromLog(logContent: string): any {
	const debugInfo: any = {};

	// Check if log contains debug information block
	if (!logContent.includes('AppleBlox Debug Information:')) {
		return debugInfo;
	}

	// Extract OS Info
	const osInfoMatch = logContent.match(/OS Info:[\s\S]*?(?=CPU Info:|$)/);
	if (osInfoMatch) {
		const osInfoText = osInfoMatch[0];

		// Extract OS name
		const osNameMatch = osInfoText.match(/Name: ([^\r\n]+)/);
		if (osNameMatch) debugInfo.osName = osNameMatch[1].trim();

		// Extract OS version
		const osVersionMatch = osInfoText.match(/Version: ([^\r\n]+)/);
		if (osVersionMatch) debugInfo.osVersion = osVersionMatch[1].trim();

		// Extract OS architecture
		const osArchMatch = osInfoText.match(/Architecture: ([^\r\n]+)/);
		if (osArchMatch) debugInfo.osArchitecture = osArchMatch[1].trim();
	}

	// Extract CPU Info
	const cpuInfoMatch = logContent.match(/CPU Info:[\s\S]*?(?=Memory Info:|$)/);
	if (cpuInfoMatch) {
		const cpuInfoText = cpuInfoMatch[0];

		// Extract CPU model
		const cpuModelMatch = cpuInfoText.match(/Model: ([^\r\n]+)/);
		if (cpuModelMatch) debugInfo.cpuModel = cpuModelMatch[1].trim();

		// Extract CPU architecture
		const cpuArchMatch = cpuInfoText.match(/Architecture: ([^\r\n]+)/);
		if (cpuArchMatch) debugInfo.cpuArchitecture = cpuArchMatch[1].trim();

		// Extract logical threads
		const logicalThreadsMatch = cpuInfoText.match(/Logical Threads: ([^\r\n]+)/);
		if (logicalThreadsMatch) debugInfo.cpuThreads = logicalThreadsMatch[1].trim();
	}

	// Extract Memory Info
	const memoryInfoMatch = logContent.match(/Memory Info:[\s\S]*?(?=Display Info:|$)/);
	if (memoryInfoMatch) {
		const memoryInfoText = memoryInfoMatch[0];

		// Extract Physical Total
		const physicalTotalMatch = memoryInfoText.match(/Physical Total: ([^\r\n]+)/);
		if (physicalTotalMatch) debugInfo.ramTotal = physicalTotalMatch[1].trim();

		// Extract Physical Available
		const physicalAvailableMatch = memoryInfoText.match(/Physical Available: ([^\r\n]+)/);
		if (physicalAvailableMatch) debugInfo.ramAvailable = physicalAvailableMatch[1].trim();
	}

	// Extract Application Info
	const appInfoMatch = logContent.match(/Application Info:[\s\S]*?(?=Neutralino Info:|$)/);
	if (appInfoMatch) {
		const appInfoText = appInfoMatch[0];

		// Extract app version
		const versionMatch = appInfoText.match(/Version: ([^\r\n]+)/);
		if (versionMatch) debugInfo.appVersion = versionMatch[1].trim();

		// Extract app ID
		const appIdMatch = appInfoText.match(/Application ID: ([^\r\n]+)/);
		if (appIdMatch) debugInfo.appId = appIdMatch[1].trim();
	}

	// Extract Neutralino Info
	const neutInfoMatch = logContent.match(/Neutralino Info:[\s\S]*?(?=Window Info:|$)/);
	if (neutInfoMatch) {
		const neutInfoText = neutInfoMatch[0];

		// Extract Neutralino version
		const neutVersionMatch = neutInfoText.match(/Version: ([^\r\n]+)/);
		if (neutVersionMatch) debugInfo.neutralinoVersion = neutVersionMatch[1].trim();
	}

	// Extract Launch info (Roblox version)
	const robloxVersionMatch = logContent.match(/\[Launch\] Launching Roblox/);
	if (robloxVersionMatch) {
		// Try to find Roblox version in logs
		const versionMatch = logContent.match(/\/Users\/[^/]+\/Library\/Logs\/Roblox\/([\d.]+)_/);
		if (versionMatch) {
			debugInfo.robloxVersion = versionMatch[1].trim();
		}
	}

	return debugInfo;
}

/**
 * Formats debug info for display
 */
function formatDebugInfo(debugInfo: any): string {
	const sections: string[] = [];

	// Format OS section
	if (debugInfo.osName || debugInfo.osVersion || debugInfo.osArchitecture) {
		const osSection = ['OS Information:'];
		if (debugInfo.osName) osSection.push(`  Name: ${debugInfo.osName}`);
		if (debugInfo.osVersion) osSection.push(`  Version: ${debugInfo.osVersion}`);
		if (debugInfo.osArchitecture) osSection.push(`  Architecture: ${debugInfo.osArchitecture}`);
		sections.push(osSection.join('\n'));
	}

	// Format CPU section
	if (debugInfo.cpuModel || debugInfo.cpuArchitecture || debugInfo.cpuThreads) {
		const cpuSection = ['CPU Information:'];
		if (debugInfo.cpuModel) cpuSection.push(`  Model: ${debugInfo.cpuModel}`);
		if (debugInfo.cpuArchitecture)
			cpuSection.push(`  Architecture: ${debugInfo.cpuArchitecture}`);
		if (debugInfo.cpuThreads) cpuSection.push(`  Logical Threads: ${debugInfo.cpuThreads}`);
		sections.push(cpuSection.join('\n'));
	}

	// Format Memory section
	if (debugInfo.ramTotal || debugInfo.ramAvailable) {
		const memSection = ['Memory Information:'];
		if (debugInfo.ramTotal) memSection.push(`  Total RAM: ${debugInfo.ramTotal}`);
		if (debugInfo.ramAvailable) memSection.push(`  Available RAM: ${debugInfo.ramAvailable}`);
		sections.push(memSection.join('\n'));
	}

	// Format Application section
	if (
		debugInfo.appVersion ||
		debugInfo.appId ||
		debugInfo.neutralinoVersion ||
		debugInfo.robloxVersion
	) {
		const appSection = ['Application Information:'];
		if (debugInfo.appVersion) appSection.push(`  AppleBlox Version: ${debugInfo.appVersion}`);
		if (debugInfo.appId) appSection.push(`  Application ID: ${debugInfo.appId}`);
		if (debugInfo.neutralinoVersion)
			appSection.push(`  Neutralino Version: ${debugInfo.neutralinoVersion}`);
		if (debugInfo.robloxVersion)
			appSection.push(`  Roblox Version: ${debugInfo.robloxVersion}`);
		sections.push(appSection.join('\n'));
	}

	return sections.join('\n\n');
}

/**
 * Merges all config JSON files in the extracted directory
 */
async function mergeConfigFiles(extractPath: string, logger: any): Promise<any> {
	const mergedConfig: Record<string, any> = {};

	try {
		const configPath = path.join(extractPath, 'config');
		const configFolderExists = await fileExists(configPath);

		if (!configFolderExists) {
			logger.info('No config folder found');
			return null;
		}

		// Process all JSON files in the config directory
		const configFiles = await fs.readdir(configPath);

		for (const configFile of configFiles) {
			if (!configFile.endsWith('.json')) continue;

			const configFilePath = path.join(configPath, configFile);
			const configContent = await fs.readFile(configFilePath, 'utf-8');

			try {
				// Parse the JSON file
				const config = JSON.parse(configContent);

				// Extract the base filename without extension
				const baseName = path.basename(configFile, '.json');

				// Add to merged config
				mergedConfig[baseName] = config;
			} catch (error) {
				logger.error(`Error parsing config file ${configFile}: ${error}`);
			}
		}
	} catch (error) {
		logger.error(`Error merging config files: ${error}`);
	}

	return Object.keys(mergedConfig).length > 0 ? mergedConfig : null;
}

/**
 * Checks if a file or directory exists
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}
