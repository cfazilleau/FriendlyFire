import * as discord from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Log } from './utils';

class ConfigFile {
	global: Config = {};
	guilds: { [id: string] : Config } = {};
}

interface Config {
	[key:string] : string | number | boolean;
}

//	{
//		"global": {},
//		"guilds": {
//			"${guild.id}": {
//				"name": "${guild.name}",
//				"plugin.setting": string | number | bool,
//			}
//		}
//	}

const configPath = '.ffconfig';
let config : ConfigFile;

function LoadConfig() : void
{
	let file = '{}';

	Log(`Loading ${configPath}...`);

	if (existsSync(configPath))
	{
		file = readFileSync(configPath, 'utf8');
	}
	else
	{
		Log(`${configPath} not found, creating it with default config.`);
	}

	try
	{
		config = JSON.parse(file) as ConfigFile;
	}
	catch
	{
		Log('invalid JSON config file');
		config = new ConfigFile();
	}
	Log('Config loaded.');
}

function SaveConfig() : void
{
	writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf8');
}

export function GetProperty<Type extends string | number | boolean>(name: string, defaultValue: Type, guild? : discord.Guild) : Type
{
	if (guild)
	{
		const guildConfig : Config = config.guilds[guild.id];
		return guildConfig ? guildConfig[name] as Type : defaultValue;
	}
	else
	{
		return config.global[name] as Type ?? defaultValue;
	}
}

export function SetProperty<Type extends string | number | boolean>(name: string, value: Type, guild? : discord.Guild) : void
{
	if (guild)
	{
		const guildConfig : Config = config.guilds[guild.id] ?? {};
		guildConfig[name] = value;
		config.guilds[guild.id] = guildConfig;
	}
	else
	{
		config.global[name] = value;
	}

	SaveConfig();
}

export function CreateGuildConfig(guild : discord.Guild)
{
	SetProperty<string>('name', guild.name, guild);
}

LoadConfig();
SaveConfig();