import fs from 'node:fs/promises';
import path from 'node:path';
// Assuming PinoLogger and RegisterSlashCommand are correctly typed in @ddev
import { PinoLogger, RegisterSlashCommand } from '@ddev';
import AdmZip from 'adm-zip';
import { $ } from 'bun';
import {
	ActionRowBuilder,
	ApplicationCommandType,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	ContextMenuCommandBuilder,
	type ContextMenuCommandInteraction,
	FileBuilder,
	InteractionContextType,
	MessageFlags,
	SectionBuilder, // Keep if needed later
	SeparatorSpacingSize,
	TextDisplayBuilder,
} from 'discord.js';

type DebugInfo = Record<string, string | undefined>;
type ProfileData = Record<string, any> & {
	// Ensure name and flags exist for checking
	name?: string;
	flags?: { flag?: string;[key: string]: any }[]; // Flag structure
};

// --- Constants ---
const DPASTE_ENDPOINT = 'https://dpaste.com/api/v2/';
const RISK_LIST_URL =
	'https://raw.githubusercontent.com/AppleBlox/flagsman/refs/heads/main/data/risklist.json';

// --- Interface for mergeConfigFiles return value ---
interface MergedConfigResult {
	overallMergedConfig: Record<string, any> | null;
	mergedProfiles: ProfileData[] | null;
}

// --- Helper function for dpaste upload ---
async function uploadToDpaste(
	content: string,
	syntax: string,
	logger: any
): Promise<string | null> {
	if (!content) return null;
	try {
		logger.info(`Uploading content (syntax: ${syntax}) to dpaste...`);
		const response = await fetch(DPASTE_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ content: content, syntax: syntax }),
		});
		if (response.ok) {
			const url = (await response.text()).trim();
			logger.info(`dpaste upload successful: ${url}`);
			return url;
		}
		logger.error(
			`dpaste upload failed: ${response.status} ${response.statusText}. Response: ${await response.text()}`
		);
		return null;
	} catch (error: any) {
		logger.error(`dpaste upload network/request error: ${error.message ?? error}`);
		return null;
	}
}

RegisterSlashCommand({
	data: new ContextMenuCommandBuilder()
		.setName('Analyze AppleBlox config')
		.setContexts([InteractionContextType.Guild])
		.setType(ApplicationCommandType.Message),
	async execute(interaction: ContextMenuCommandInteraction): Promise<void> {
		const log: any = PinoLogger.child(
			{},
			{ msgPrefix: `[analyze: ${interaction.member?.user.id ?? 'unknown'}] ` }
		);
		await interaction.deferReply();

		if (!interaction.channel) {
			await interaction.editReply('Error: Could not access channel information.');
			return;
		}
		const message = await interaction.channel.messages.fetch(interaction.targetId);
		if (!message) {
			await interaction.editReply("Couldn't get message.");
			return;
		}
		const attachment = message.attachments.find((att) => att.name?.endsWith('.zip'));
		if (!attachment) {
			await interaction.editReply('No .zip file found in the message.');
			return;
		}

		const zipUrl = attachment.url;
		const zipFileName = attachment.name ?? 'download.zip';
		const currentDir = process.cwd();
		const zipFilePath = path.join(currentDir, '.zips', zipFileName);
		const extractPath = path.join(
			currentDir,
			'.zips',
			`extracted_${zipFileName.replace('.zip', '')}`
		);

		try {
			// --- File Handling ---
			await $`rm -rf .zips`;
			await $`mkdir -p .zips`;
			log.info(`Downloading from ${zipUrl}...`);
			const response = await fetch(zipUrl);
			if (!response.ok || !response.body)
				throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
			const arrayBuffer = await response.arrayBuffer();
			await Bun.write(zipFilePath, new Uint8Array(arrayBuffer));
			log.info(`ZIP file saved to ${zipFilePath}`);
			await fs.mkdir(extractPath, { recursive: true });
			log.info(`Extracting to ${extractPath}...`);
			const zip = new AdmZip(zipFilePath);
			zip.extractAllTo(extractPath, true);
			log.info(`Successfully extracted to ${extractPath}`);
			// --- End File Handling ---

			// --- Fetch Risk List ---
			let riskyFlagSet = new Set<string>();
			let riskCheckPerformed = false;
			try {
				log.info(`Fetching risk list from ${RISK_LIST_URL}...`);
				const riskResponse = await fetch(RISK_LIST_URL);
				if (riskResponse.ok) {
					const riskListJson: unknown = await riskResponse.json();
					if (
						Array.isArray(riskListJson) &&
						riskListJson.every((item) => typeof item === 'string')
					) {
						riskyFlagSet = new Set(riskListJson as string[]);
						log.info(
							`Successfully fetched and parsed ${riskyFlagSet.size} risky flag names.`
						);
						riskCheckPerformed = true;
					} else {
						log.error('Fetched risk list was not a valid JSON array of strings.');
					}
				} else {
					log.error(
						`Failed to fetch risk list: ${riskResponse.status} ${riskResponse.statusText}`
					);
				}
			} catch (fetchError: any) {
				log.error(
					`Error fetching or parsing risk list: ${fetchError.message ?? fetchError}`
				);
			}
			// --- End Fetch Risk List ---

			// --- Analysis (including merging configs/profiles) ---
			const { debugInfo, logErrors } = await analyzeLogFiles(extractPath, log);
			const { overallMergedConfig, mergedProfiles } = await mergeConfigFiles(
				extractPath,
				log
			);
			// --- End Analysis ---

			// --- Check Profiles for Risky Flags ---
			const foundRiskyFlags: string[] = [];
			if (
				riskCheckPerformed &&
				mergedProfiles &&
				mergedProfiles.length > 0 &&
				riskyFlagSet.size > 0
			) {
				log.info('Checking profiles for risky flags...');
				for (const profile of mergedProfiles) {
					if (profile.flags && Array.isArray(profile.flags)) {
						for (const flagData of profile.flags) {
							if (
								flagData &&
								typeof flagData.flag === 'string' &&
								riskyFlagSet.has(flagData.flag)
							) {
								const profileName = profile.name
									? `"${profile.name}"`
									: '(Unnamed Profile)';
								foundRiskyFlags.push(
									`- \`${flagData.flag}\` (in profile ${profileName})`
								);
								log.warn(
									`Found risky flag: ${flagData.flag} in profile ${profileName}`
								);
							}
						}
					}
				}
			}
			// --- End Check Profiles ---

			// --- V2 Component Building ---
			const container = new ContainerBuilder();
			const filesToSend: AttachmentBuilder[] = [];
			let overallConfigAttachment: AttachmentBuilder | null = null;
			let overallPasteUrl: string | null = null;
			let profilesPasteUrl: string | null = null;

			// 1. Title and Timestamp
			const titleText = new TextDisplayBuilder().setContent(
				`# Config analysis\n*For file \`${zipFileName}\` - Completed at <t:${Math.floor(Date.now() / 1000)}:F>*`
			);
			container.addTextDisplayComponents(titleText);
			container.addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small));

			// 2. System Information
			if (Object.keys(debugInfo).length > 0) {
				const sysInfoContent: string[] = ['### 📊 System Information'];
				if (debugInfo.osName)
					sysInfoContent.push(
						`- **OS:** ${debugInfo.osName}${debugInfo.osVersion ? ` ${debugInfo.osVersion}` : ''}${debugInfo.osArchitecture ? ` (${debugInfo.osArchitecture})` : ''}`
					);
				if (debugInfo.cpuModel)
					sysInfoContent.push(
						`- **CPU:** ${debugInfo.cpuModel}${debugInfo.cpuArchitecture ? ` (${debugInfo.cpuArchitecture})` : ''}${debugInfo.cpuThreads ? ` - ${debugInfo.cpuThreads} Threads` : ''}`
					);
				if (debugInfo.ramTotal)
					sysInfoContent.push(
						`- **RAM:** ${debugInfo.ramTotal} Total${debugInfo.ramAvailable ? ` (${debugInfo.ramAvailable} Available)` : ''}`
					);
				if (debugInfo.appVersion)
					sysInfoContent.push(
						`- **AppleBlox:** v${debugInfo.appVersion}${debugInfo.appId ? ` (ID: ${debugInfo.appId})` : ''}`
					);
				if (debugInfo.neutralinoVersion)
					sysInfoContent.push(`- **Neutralino:** v${debugInfo.neutralinoVersion}`);
				if (debugInfo.robloxVersion)
					sysInfoContent.push(`- **Roblox:** v${debugInfo.robloxVersion}`);
				const sysInfoText = new TextDisplayBuilder().setContent(sysInfoContent.join('\n'));
				container.addTextDisplayComponents(sysInfoText);
			} else {
				const noSysInfoText = new TextDisplayBuilder().setContent(
					'### 📊 System Information\n- *No detailed system information found in logs.*'
				);
				container.addTextDisplayComponents(noSysInfoText);
			}
			container.addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Large));

			// 3. Error Reporting
			const errorCount = logErrors.length;
			if (errorCount > 0) {
				const errorTitleText = new TextDisplayBuilder().setContent(
					`### ⚠️ Errors Found (${errorCount})`
				);
				container.addTextDisplayComponents(errorTitleText);
				const errorDetailsContent: string[] = [];
				let displayedErrors = 0;
				for (const error of logErrors) {
					if (displayedErrors >= 5) break;
					const truncatedError =
						error.length > 200 ? `${error.substring(0, 197)}...` : error;
					errorDetailsContent.push(
						`**${displayedErrors + 1}.** \`\`\`log\n${truncatedError}\n\`\`\``
					);
					displayedErrors++;
				}
				const errorDetailsText = new TextDisplayBuilder().setContent(
					errorDetailsContent.join('\n')
				);
				container.addTextDisplayComponents(errorDetailsText);
				if (errorCount > displayedErrors) {
					const moreErrorsText = new TextDisplayBuilder().setContent(
						`*...and ${errorCount - displayedErrors} more error(s) found in the logs.*`
					);
					container.addTextDisplayComponents(moreErrorsText);
				}
				// Add separator after errors if they exist
				container.addSeparatorComponents((sep) =>
					sep.setSpacing(SeparatorSpacingSize.Large)
				);
			} else {
				const noErrorsText = new TextDisplayBuilder().setContent(
					'### ✅ No Errors Found\n*No errors detected in the logs.*'
				);
				container.addTextDisplayComponents(noErrorsText);
				// Add separator after no errors message
				container.addSeparatorComponents((sep) =>
					sep.setSpacing(SeparatorSpacingSize.Large)
				);
			}

			// 4. Risky Flag Warning Section (NEW)
			if (foundRiskyFlags.length > 0) {
				const warningContent = [
					'### ❗ Risky Flags Detected',
					'*The following flags were found in your profiles and are often included in "Fast Flag" lists promoted by YouTubers for engagement, but may not provide real benefits or could potentially cause issues:*',
					...foundRiskyFlags, // Spread the array of found flags
				];
				const warningText = new TextDisplayBuilder().setContent(warningContent.join('\n'));
				container.addTextDisplayComponents(warningText);
				container.addSeparatorComponents((sep) =>
					sep.setSpacing(SeparatorSpacingSize.Large)
				);
			} else if (!riskCheckPerformed) {
				// Optional: Notify user if the check couldn't be done
				const checkFailedText = new TextDisplayBuilder().setContent(
					'### ⚠️ Could Not Check for Risky Flags\n*Failed to fetch the list of known risky flags.*'
				);
				container.addTextDisplayComponents(checkFailedText);
				container.addSeparatorComponents((sep) =>
					sep.setSpacing(SeparatorSpacingSize.Large)
				);
			}

			// 5. Configuration File Section (Attach overall, dpaste both)
			// Process Overall Config: Create attachment AND upload to dpaste
			if (overallMergedConfig) {
				let overallConfigJson: string | null = null;
				try {
					overallConfigJson = JSON.stringify(overallMergedConfig, null, 2);
					const overallConfigFilePath = path.join(
						currentDir,
						'.zips',
						'merged_config_overall.json'
					);
					await fs.writeFile(overallConfigFilePath, overallConfigJson, 'utf-8');
					overallConfigAttachment = new AttachmentBuilder(overallConfigFilePath, {
						name: `appleblox-config-overall-${new Date().toISOString().slice(0, 10)}.json`,
						description: 'Merged Overall AppleBlox Configuration',
					});
					filesToSend.push(overallConfigAttachment);
					log.info('Overall merged config file created for attachment.');
				} catch (fileError: any) {
					log.error(
						`Error creating overall config file for attachment: ${fileError.message ?? fileError}`
					);
				}
				if (overallConfigJson)
					overallPasteUrl = await uploadToDpaste(overallConfigJson, 'json', log);
			}

			// Process Merged Profiles: Upload to dpaste
			if (mergedProfiles && mergedProfiles.length > 0) {
				try {
					const profilesJson = JSON.stringify(mergedProfiles, null, 2);
					profilesPasteUrl = await uploadToDpaste(profilesJson, 'json', log);
				} catch (stringifyError: any) {
					log.error(
						`Error stringifying merged profiles: ${stringifyError.message ?? stringifyError}`
					);
				}
			} else {
				log.info('No profiles found or merged to upload.');
			}

			// Build Configuration Section UI
			const configTextContent: string[] = ['### ⚙️ Configuration'];
			let foundConfig = false;
			if (overallConfigAttachment) {
				configTextContent.push('*The overall merged configuration is attached.*');
				foundConfig = true;
			} else if (overallMergedConfig) {
				configTextContent.push('*Could not attach the overall merged configuration file.*');
				foundConfig = true;
			}
			if (overallPasteUrl) {
				configTextContent.push('*Overall config uploaded to dpaste (link below).*');
				foundConfig = true;
			} else if (overallMergedConfig) {
				configTextContent.push('*Could not upload overall config to dpaste.*');
				foundConfig = true;
			}
			if (profilesPasteUrl) {
				configTextContent.push('*Merged profiles uploaded to dpaste (link below).*');
				foundConfig = true;
			} else if (mergedProfiles && mergedProfiles.length > 0) {
				configTextContent.push('*Could not upload merged profiles to dpaste.*');
				foundConfig = true;
			}
			if (!foundConfig) {
				configTextContent.push('*No configuration or profile files found/processed.*');
			}
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(configTextContent.join('\n'))
			);
			if (overallConfigAttachment)
				container.addFileComponents(
					new FileBuilder().setURL(`attachment://${overallConfigAttachment.name}`)
				);

			// Add Buttons
			const actionRow = new ActionRowBuilder<ButtonBuilder>();
			let addedButtons = false;
			if (overallPasteUrl) {
				actionRow.addComponents(
					new ButtonBuilder()
						.setLabel('Open Overall Config (dpaste)')
						.setStyle(ButtonStyle.Link)
						.setURL(overallPasteUrl)
				);
				addedButtons = true;
			}
			if (profilesPasteUrl) {
				actionRow.addComponents(
					new ButtonBuilder()
						.setLabel('Open Merged Profiles (dpaste)')
						.setStyle(ButtonStyle.Link)
						.setURL(profilesPasteUrl)
				);
				addedButtons = true;
			}
			if (addedButtons) container.addActionRowComponents(actionRow);
			// --- End V2 Component Building ---

			// --- Sending Reply ---
			await interaction.editReply({
				content: '',
				components: [container],
				files: filesToSend,
				// @ts-expect-error - Flags might not be typed correctly
				flags: MessageFlags.IsComponentsV2,
			});
			// --- End Sending Reply ---
		} catch (error: any) {
			log.error(`Error processing ZIP file: ${error.message ?? error}`);
			await interaction.editReply({
				content: `❌ Error processing ZIP file: ${error.message ?? 'An unknown error occurred.'}`,
				components: [],
				files: [],
			});
		} finally {
			// Optional cleanup: await $`rm -rf .zips`;
		}
	},
});

// --- Helper Functions ---

async function analyzeLogFiles(
	extractPath: string,
	logger: any
): Promise<{ debugInfo: DebugInfo; logErrors: string[] }> {
	const errors: string[] = [];
	let debugInfo: DebugInfo = {};
	try {
		const logsPath = path.join(extractPath, 'logs');
		let filesToScan: string[] = [];
		let basePath = extractPath;
		const logsFolderExists = await fileExists(logsPath);
		if (logsFolderExists) {
			basePath = logsPath;
			filesToScan = (await fs.readdir(logsPath)).filter((f) => f.endsWith('.log'));
		} else {
			logger.info('No logs folder found, checking root directory.');
			if (await fileExists(extractPath)) {
				filesToScan = (await fs.readdir(extractPath)).filter((f) => f.endsWith('.log'));
			} else {
				logger.warn('Root extraction path does not exist.');
			}
		}
		if (filesToScan.length === 0) {
			logger.info('No log files found.');
			return { debugInfo: {}, logErrors: [] };
		}
		for (const logFile of filesToScan) {
			const logFilePath = path.join(basePath, logFile);
			try {
				const logContent = await fs.readFile(logFilePath, 'utf-8');
				errors.push(...extractErrorsFromLog(logContent, logFile));
				debugInfo = { ...debugInfo, ...extractDebugInfoFromLog(logContent) };
			} catch (readError: any) {
				logger.error(
					`Error reading log file ${logFile}: ${readError.message ?? readError}`
				);
				errors.push(`System Error: Could not read log file ${logFile}`);
			}
		}
	} catch (error: any) {
		logger.error(`Error during log file analysis phase: ${error.message ?? error}`);
		errors.push(
			`System Error: Failed during log analysis - ${error.message ?? 'Unknown analysis error'}`
		);
	}
	return { debugInfo, logErrors: errors };
}

function extractErrorsFromLog(logContent: string, fileName: string): string[] {
	const errors: string[] = [];
	const errorPatterns: RegExp[] = [
		/\b(error|err|exception|exc|fail|failure)\b:?.*$/i,
		/Cannot perform/i,
		/could not/i,
		/\{\s*"code"\s*:\s*"NE_/i,
		/Error while/i,
	];
	const lines = logContent.split('\n');
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;
		for (const pattern of errorPatterns) {
			if (pattern.test(trimmedLine)) {
				const timestampMatch = trimmedLine.match(/^\[\s*(.*?)\s*\]/);
				const prefix = timestampMatch ? `${fileName} [${timestampMatch[1]}]` : fileName;
				const messageContent = trimmedLine.replace(/^\[\s*(.*?)\s*\]\s*/, '');
				errors.push(`${prefix}: ${messageContent}`);
				break;
			}
		}
	}
	return errors;
}

function extractDebugInfoFromLog(logContent: string): DebugInfo {
	const debugInfo: DebugInfo = {};
	const extractValue = (block: string, label: string, content: string): string | undefined => {
		const blockR = new RegExp(
			`${block}\\s*:\\s*([\\s\\S]*?)(?=\\n\\n|\\n[A-Z][a-zA-Z ]+\\s*:|$)`
		);
		const blockM = content.match(blockR);
		if (blockM?.[1]) {
			const valueR = new RegExp(`^\\s*${label}:\\s*(.*)$`, 'm');
			const valueM = blockM[1].match(valueR);
			return valueM?.[1]?.trim() || undefined;
		}
		return undefined;
	};
	debugInfo.osName = extractValue('OS Info', 'Name', logContent);
	debugInfo.osVersion = extractValue('OS Info', 'Version', logContent);
	debugInfo.osArchitecture = extractValue('OS Info', 'Architecture', logContent);
	debugInfo.cpuModel = extractValue('CPU Info', 'Model', logContent);
	debugInfo.cpuArchitecture = extractValue('CPU Info', 'Architecture', logContent);
	debugInfo.cpuThreads = extractValue('CPU Info', 'Logical Threads', logContent);
	debugInfo.ramTotal = extractValue('Memory Info', 'Physical Total', logContent);
	debugInfo.ramAvailable = extractValue('Memory Info', 'Physical Available', logContent);
	debugInfo.appVersion = extractValue('Application Info', 'Version', logContent);
	debugInfo.appId = extractValue('Application Info', 'Application ID', logContent);
	debugInfo.neutralinoVersion = extractValue('Neutralino Info', 'Version', logContent);
	const rbxVerMatch = logContent.match(/Found latest log file:.*?\/Roblox\/([\d\.]+)_/);
	if (rbxVerMatch) debugInfo.robloxVersion = rbxVerMatch[1].trim();
	else {
		const launchVerMatch = logContent.match(
			/(?:Launching Roblox.*?Version:|version)\s*([\d\.]+)/i
		);
		if (launchVerMatch) debugInfo.robloxVersion = launchVerMatch[1].trim();
	}
	return debugInfo;
}

async function mergeConfigFiles(extractPath: string, logger: any): Promise<MergedConfigResult> {
	const overallMergedConfig: Record<string, any> = {};
	const mergedProfiles: ProfileData[] = [];
	let configDirPath = path.join(extractPath, 'config');
	let configFolderExists = await fileExists(configDirPath);
	let baseConfigPath = extractPath;
	if (!configFolderExists) {
		configDirPath = extractPath;
		logger.info('No config folder found, checking root directory for JSON files.');
		configFolderExists = await fileExists(configDirPath);
		if (!configFolderExists) {
			logger.warn('Root extraction path does not exist either.');
			return { overallMergedConfig: null, mergedProfiles: null };
		}
		baseConfigPath = extractPath;
	} else {
		baseConfigPath = configDirPath;
		logger.info('Found config folder.');
	}
	const profilesPath = path.join(baseConfigPath, 'profiles');
	const profilesFolderExists = await fileExists(profilesPath);
	try {
		const files = await fs.readdir(configDirPath);
		const potentialConfigFiles = files.filter((f) => f.endsWith('.json'));
		const configFiles: string[] = [];
		for (const file of potentialConfigFiles) {
			const fullPath = path.join(configDirPath, file);
			try {
				const stats = await fs.stat(fullPath);
				if (!stats.isDirectory()) {
					configFiles.push(file);
				} else if (file === 'profiles' && fullPath === profilesPath) {
					logger.info('Skipping profiles directory while reading main config.');
				}
			} catch (statError) {
				logger.warn(`Could not stat ${fullPath}, skipping.`);
			}
		}
		for (const configFile of configFiles) {
			const configFilePath = path.join(configDirPath, configFile);
			try {
				const configContent = await fs.readFile(configFilePath, 'utf-8');
				const config = JSON.parse(configContent);
				const baseName = path.basename(configFile, '.json');
				overallMergedConfig[baseName] = config;
				logger.info(`Merged overall config file: ${configFile}`);
			} catch (error: any) {
				logger.error(`Error parsing config file ${configFile}: ${error.message ?? error}`);
			}
		}
		if (profilesFolderExists) {
			logger.info(`Processing profiles folder: ${profilesPath}`);
			const profileFiles = (await fs.readdir(profilesPath)).filter((f) =>
				f.endsWith('.json')
			);
			for (const profileFile of profileFiles) {
				const profileFilePath = path.join(profilesPath, profileFile);
				try {
					const profileContent = await fs.readFile(profileFilePath, 'utf-8');
					const profileData: ProfileData = JSON.parse(profileContent);
					mergedProfiles.push(profileData);
					logger.info(`Merged profile file: ${profileFile}`);
				} catch (error: any) {
					logger.error(
						`Error parsing profile file ${profileFile}: ${error.message ?? error}`
					);
				}
			}
		} else {
			logger.info(`Profiles subdirectory not found at ${profilesPath}`);
		}
	} catch (error: any) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || configFolderExists) {
			logger.error(
				`Error reading config directory ${configDirPath}: ${error.message ?? error}`
			);
		}
		return {
			overallMergedConfig:
				Object.keys(overallMergedConfig).length > 0 ? overallMergedConfig : null,
			mergedProfiles: mergedProfiles.length > 0 ? mergedProfiles : null,
		};
	}
	return {
		overallMergedConfig:
			Object.keys(overallMergedConfig).length > 0 ? overallMergedConfig : null,
		mergedProfiles: mergedProfiles.length > 0 ? mergedProfiles : null,
	};
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}
