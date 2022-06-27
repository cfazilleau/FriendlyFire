import * as discord from 'discord.js';
import * as fs from 'node:fs';

import { Plugin } from './pluginloader';
import { Log } from './utils';

class ConfigFile {
	global: Config = {};
	guilds: { [id: string] : Config } = {};
}

interface Config {
	[key:string] : any;
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

	// Read file if it exists
	if (fs.existsSync(configPath))
	{
		file = fs.readFileSync(configPath, 'utf8');
	}
	else
	{
		Log(`${configPath} not found, creating it with default config.`);
	}

	// try to load file as JSON
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
	try
	{
		fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf8');
	}
	catch (e)
	{
		Log(`error saving config file as JSON: ${e}`);
	}

}

function GetPropertyInternal<Type>(key: string, defaultValue: Type, guild? : discord.Guild) : Type
{
	if (guild)
	{
		const guildConfig : Config = config.guilds[guild.id];
		return guildConfig ? guildConfig[key] as Type : defaultValue;
	}
	else
	{
		return config.global[key] as Type ?? defaultValue;
	}
}

function SetPropertyInternal<Type>(key: string, value: Type, guild? : discord.Guild) : void
{
	if (guild)
	{
		const guildConfig : Config = config.guilds[guild.id] ?? {};
		guildConfig[key] = value;
		config.guilds[guild.id] = guildConfig;
	}
	else
	{
		config.global[key] = value;
	}

	SaveConfig();
}

export function GetProperty<Type>(plugin: Plugin, key: string, defaultValue: Type, guild? : discord.Guild) : Type
{
	return GetPropertyInternal(`${plugin.name}.${key}`, defaultValue, guild);
}

export function SetProperty<Type>(plugin: Plugin, key: string, value: Type, guild? : discord.Guild) : void
{
	return SetPropertyInternal(`${plugin.name}.${key}`, value, guild);
}

export function CreateGuildConfig(guild : discord.Guild)
{
	SetPropertyInternal<string>('name', guild.name, guild);
}

LoadConfig();
SaveConfig();