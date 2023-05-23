import * as builders from '@discordjs/builders';
import * as types from 'discord-api-types/v10';
import * as discord from 'discord.js';
import * as fs from 'node:fs';

import { Plugin, CommandCallback, ContextMenuCallback, PluginCommand } from '../plugin';
import { restAPI } from '../main';
import { Log } from './utils';
import { RESTPostAPIContextMenuApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { GetProperty } from './config';
import { coreplugin as corePlugin, coreplugin } from './core';

// Referenced plugins
const plugins : Map<string, Plugin> = new Map;
// Callbacks by command names
const callbacks : Map<string, CommandCallback | ContextMenuCallback> = new Map();
// Commands by plugins
const commands : {[key: string]: types.RESTPostAPIApplicationCommandsJSONBody[]} = {};
// Are plugins loaded
let pluginsLoaded = false;

export async function HandleCommand(command : discord.CommandInteraction<discord.CacheType> | discord.ContextMenuInteraction<discord.CacheType>)
{
	Log(`Executing command '${command.commandName}' from '${command.user.tag}'`);

	const callback = callbacks.get(command.commandName);
	if (callback == undefined) throw 'Undefined Callback';

	try
	{
		if (command instanceof discord.CommandInteraction)
		{
			await (callback as CommandCallback)(command);
		}
		else if (command instanceof discord.ContextMenuInteraction)
		{
			await (callback as ContextMenuCallback)(command);
		}
	}
	catch (error)
	{
		Log(`Error executing command '${command.commandName}': '${error}'`);

		const embed = new discord.MessageEmbed({
			title: 'Oops',
			description: `
				Error executing command ${builders.inlineCode(command.commandName)}:
				${builders.inlineCode(command.toString())}
				${builders.codeBlock(`${error}`)}`,
			color: '#ff0000',
		});

		if (command.deferred)
		{
			command.editReply({ embeds: [embed] });
		}
		else if (command.replied)
		{
			command.channel?.send({ embeds: [embed] });
		}
		else
		{
			command.reply({ embeds: [embed] });
		}
	}
}

function GetCommandsPayload(guild: discord.Guild): types.RESTPostAPIApplicationCommandsJSONBody[]
{
	// Get plugins enabled per guild
	const pluginNames: string[] = GetProperty(corePlugin, 'enabledPlugins', Array.from(plugins.keys()), guild)

	let payload: types.RESTPostAPIApplicationCommandsJSONBody[] = [];
	pluginNames.forEach(plugin => {
		payload = payload.concat(commands[plugin] ?? []);
	})

	return payload;
}

export async function RegisterCommands(guild : discord.Guild) : Promise<void>
{
	// Check for valid clientId
	if (process.env.FF_ClientId == undefined)
	{
		throw 'Environment variable \'FF_ClientId\' not set.';
	}

	Log(`Registering commands... (${guild.name})`);

	const commandsPayload = GetCommandsPayload(guild);

	// Register commands from all loaded plugins
	await restAPI.put(types.Routes.applicationGuildCommands(process.env.FF_ClientId, guild.id), { body: commandsPayload })
		.catch(e => Log(e));

	Log(`Registered ${commandsPayload.length} commands. (${guild.name})`);
}

function LoadCommand(command : PluginCommand, plugin: Plugin)
{
	if (!commands[plugin.name])
	{
		commands[plugin.name] = [];
	}
	commands[plugin.name].push(command.builder.toJSON());
	callbacks.set(command.builder.name, command.callback);
}

export function LoadPlugins(client : discord.Client<boolean>)
{
	Log(`Loading core plugin...`);

	// Load Core plugin first
	RegisterPlugin(coreplugin);

	// TODO: find a better way and clean that
	const pluginsDir = 'plugins';
	const commandFiles = fs.readdirSync(`./dist/${pluginsDir}`).filter(file => file.endsWith('.js'));

	Log(`Loading ${commandFiles.length} additionnal plugins...`);

	// Require plugins so they can all register themselves
	for (const file of commandFiles)
	{
		try
		{
			require(`../${pluginsDir}/${file}`);
		}
		catch (error)
		{
			Log(`Error loading ${file}: ${error}`);
		}
	}

	// Init plugins
	plugins.forEach(plugin =>
	{
		try
		{
			plugin.Init(client);
			Log(`Plugin initialized: ${plugin.name}`);
		}
		catch (error)
		{
			Log(`Error initializing plugin ${plugin.name}: ${error}`);
		}
	});

	// Import commands from plugins
	plugins.forEach(plugin =>
	{
		plugin.commands.forEach(command => LoadCommand(command, plugin));
	});

	// Set flags so plugins registered after LoadPlugins() will throw an error.
	pluginsLoaded = true;
}

export function RegisterPlugin(plugin : Plugin)
{
	if (pluginsLoaded)
	{
		throw 'plugins have already been loaded, you can\'t register any more of them.';
	}

	plugins.set(plugin.name, plugin);
	Log(`Registered plugin '${plugin.name}'`);
}
