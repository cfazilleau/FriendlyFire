import * as discord from 'discord.js';
import * as fs from 'node:fs';

import { Plugin } from '../plugin';
import { Log } from './utils';

class ConfigFile
{
	global: ConfigData = {};
	guilds: { [id: string] : ConfigData } = {};
}

interface ConfigData
{
	[key:string] : unknown;
}

const readonly = process.env.READ_ONLY_FS == 'true';
const configPath = '.ffconfig';
let config : ConfigFile;

function LoadConfig() : void
{
	let file = '{}';

	// Read file if it exists
	if (fs.existsSync(configPath))
	{
		file = fs.readFileSync(configPath, 'utf8');
	}
	else
	{
		Log(`${configPath} not found, creating it with default config`);
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

	Log(`Loaded ${configPath}`);
}

function SaveConfig() : void
{
	if (readonly)
	{
		return;
	}

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
		const guildConfig : ConfigData = config.guilds[guild.id] ?? {};
		return (guildConfig[key] ?? config.global[key]) as Type ?? defaultValue;
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
		const guildConfig : ConfigData = config.guilds[guild.id] ?? {};
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
	const value: Type = GetPropertyInternal<Type>(`${plugin.name}.${key}`, defaultValue, guild);

	if (value == defaultValue)
	{
		SetPropertyInternal<Type>(`${plugin.name}.${key}`, value, guild);
	}

	return value;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SetProperty<Type>(plugin: Plugin, key: string, value: Type, guild? : discord.Guild) : void
{
	return SetPropertyInternal<Type>(`${plugin.name}.${key}`, value, guild);
}

export function CreateGuildConfig(guild : discord.Guild)
{
	if (GetPropertyInternal<string | undefined>('name', undefined, guild) == undefined)
	{
		SetPropertyInternal<string>('name', guild.name, guild);
		Log('Created new guild configuration', [ guild.name ]);
	}
}

if (readonly)
{
	Log('Read only mode on.');
}

LoadConfig();
SaveConfig();