import * as discord from 'discord.js';
import * as builders from '@discordjs/builders';

import { RegisterPlugin } from './internal/pluginloader';
import { GetProperty } from './internal/config';
import { Log } from './internal/utils';

export * from './internal/utils';
export { DatabaseModel } from './internal/mongodb';

export type CommandCallback = (interaction: discord.CommandInteraction<discord.CacheType>) => Promise<void>;

export interface PluginCommand {
	builder: builders.SlashCommandBuilder;
	callback: CommandCallback;
}

export abstract class Plugin
{
	public abstract name : string;
	public abstract commands : PluginCommand[];
	public abstract Init(client : discord.Client<boolean>) : void;

	protected GetProperty<Type>(key: string, defaultValue: Type, guild? : discord.Guild) : Type
	{
		return GetProperty<Type>(this, key, defaultValue, guild);
	}

	public Register()
	{
		RegisterPlugin(this);
	}
}

export async function CatchAndLog<Type>(listener: () => Type, interaction? : discord.Interaction)
{
	try
	{
		return await listener();
	}
	catch (error)
	{
		Log(error);

		if (interaction && interaction.channel)
		{
			const embed = new discord.MessageEmbed({
				title: 'Oops',
				description: `Error during interaction:\n${builders.codeBlock(`${error}`)}`,
				color: '#ff0000',
			});

			interaction.channel.send({ embeds: [ embed ] });
		}
	}
}