import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { CacheType, Client, CommandInteraction } from 'discord.js';
import { readdirSync } from 'node:fs';

export type CommandCallback = (interaction: CommandInteraction<CacheType>) => Promise<void>;

export abstract class Plugin
{
	public abstract name : string;
	public abstract commands : { builder: RESTPostAPIApplicationCommandsJSONBody, callback: CommandCallback }[];
	public abstract Init(client : Client<boolean>) : void;
}

// Referenced plugins
const plugins : Map<string, Plugin> = new Map;
// CommandBuilders
export const commands : RESTPostAPIApplicationCommandsJSONBody[] = [];
// Callbacks by command names
const callbacks : Map<string, CommandCallback> = new Map();
// Are plugins loaded
let pluginsLoaded = false;

export async function HandleCommand(command : CommandInteraction)
{
	console.log(`Executing command '${command.toString()}'`);

	await callbacks.get(command.commandName)?.(command)
		.catch(error =>
		{
			console.log(`Error executing '${command.toString()}': '${error}'`);
			command.reply(`Error executing \`${command.toString()}\`:\n\`\`\`${error}\`\`\``);
		});
}

export function LoadPlugins(client : Client<boolean>)
{
	// TODO: find a better way and clean that
	const pluginsDir = './plugins';
	const commandFiles = readdirSync(`./dist/${pluginsDir}`).filter(file => file.endsWith('.js'));

	// Require plugins so they can all register themselves
	for (const file of commandFiles)
	{
		require(`${pluginsDir}/${file}`);
	}

	// Init plugins
	plugins.forEach(plugin =>
	{
		plugin.Init(client);
		console.log(`Loaded plugin ${plugin.name}`);
	});

	// Import commands from plugins
	plugins.forEach(plugin =>
	{
		plugin.commands.forEach(command =>
		{
			commands.push(command.builder);
			callbacks.set(command.builder.name, command.callback);
		});
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
}
