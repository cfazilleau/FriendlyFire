import { SlashCommandBuilder } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction, Guild } from 'discord.js';
import { Rcon } from 'rcon-client/lib';

import { Log, Plugin, PluginCommand } from '../plugin';

class MinecraftPlugin extends Plugin
{
	public name = 'Minecraft';
	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('mc-whitelist')
					.setDescription('manage whitelist of the minecraft server')
					.setDefaultPermission(false)
					.addSubcommand(add => add
						.setName('add')
						.setDescription('add a player to the whitelist')
						.addStringOption(option => option
							.setName('username')
							.setDescription('minecraft username to add to the whitelist')
							.setRequired(true)))
					.addSubcommand(remove => remove
						.setName('remove')
						.setDescription('remove a player from the whitelist')
						.addStringOption(option => option
							.setName('username')
							.setDescription('minecraft username to remove from the whitelist')
							.setRequired(true)))
					.addSubcommand(list => list
						.setName('list')
						.setDescription('get a list of all whitelisted players'))
					.addSubcommand(reload => reload
						.setName('reload')
						.setDescription('reload the whitelist')) as SlashCommandBuilder,
			callback:
				async (interaction) =>
				{
					const subcommand = interaction.options.getSubcommand();

					let command = `whitelist ${subcommand}`;
					if (subcommand == 'add' || subcommand == 'remove')
					{
						command += ' ' + interaction.options.getString('username');
					}

					this.HandleCommand(command, interaction);
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('mc-command')
					.setDescription('send a command to the minecraft server')
					.setDefaultPermission(false)
					.addStringOption(option => option
						.setName('command')
						.setDescription('command to send to the server (with no \'/\' at the start)')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction) =>
				{
					const command = interaction.options.getString('command');

					if (command == undefined)
					{
						throw 'no command specified.';
					}

					this.HandleCommand(command, interaction);
				},
		},
	];

	private guildRcons: Map<string, Rcon> = new Map;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>): void
	{
		Log('Minecraft');
	}

	private async HandleCommand(command: string, interaction: CommandInteraction<CacheType>)
	{
		await interaction.deferReply();

		let response: string;
		try
		{
			const rcon = this.GetGuildRcon(interaction.guild as Guild);
			await rcon.connect();

			response = await rcon.send(command);
			response = this.CleanMinecraftTags(response);
			await rcon.end();
		}
		catch (error)
		{
			response = `${error}`;
		}

		interaction.editReply(response);
	}

	private GetGuildRcon(guild: Guild) : Rcon
	{
		if (this.guildRcons.has(guild.id))
		{
			return this.guildRcons.get(guild.id) as Rcon;
		}

		const port = this.GetProperty<number>('port', 25575, guild);
		const host = this.GetProperty<string | undefined>('ip', undefined, guild);
		const pass = this.GetProperty<string | undefined>('password', undefined, guild);

		if (host == undefined || pass == undefined)
		{
			throw `config not set for guild '${guild.name}'`;
		}

		Log(`Creating new Rcon for guild ${guild.id}. (${guild.name})`);
		const rcon = new Rcon({ host: host, port: port, password: pass });
		this.guildRcons.set(guild.id, rcon);
		return rcon;
	}

	private CleanMinecraftTags(text: string): string
	{
		return text.replace(/§./g, '');
	}
}

(new MinecraftPlugin()).Register();