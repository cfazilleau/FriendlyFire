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
					.setDescription('Manage whitelist of the minecraft server')
					.setDescriptionLocalization('fr', 'Gérer la whitelist du serveur minecraft')
					.setDefaultPermission(false)
					.addSubcommand(add => add
						.setName('add')
						.setDescription('Add a player to the whitelist')
						.setDescriptionLocalization('fr', 'Ajouter un joueur a la whitelist')
						.addStringOption(option => option
							.setName('username')
							.setDescription('Minecraft username to add to the whitelist')
							.setDescriptionLocalization('fr', 'Pseudo Minecraft a ajouter a la whitelist')
							.setRequired(true)))
					.addSubcommand(remove => remove
						.setName('remove')
						.setDescription('Remove a player from the whitelist')
						.setDescriptionLocalization('fr', 'Retirer un joueur de la whitelist')
						.addStringOption(option => option
							.setName('username')
							.setDescription('Minecraft username to remove from the whitelist')
							.setDescriptionLocalization('fr', 'Pseudo Minecraft a retirer de la whitelist')
							.setRequired(true)))
					.addSubcommand(list => list
						.setName('list')
						.setDescription('Get a list of all whitelisted players')
						.setDescriptionLocalization('fr', 'Optenir une list de tous les joueurs de la whitelist'))
					.addSubcommand(reload => reload
						.setName('reload')
						.setDescription('Reload the whitelist')
						.setDescriptionLocalization('fr', 'Rafraichir la whitelist')) as SlashCommandBuilder,
			callback:
				async (interaction) =>
				{
					const subcommand = interaction.options.getSubcommand();

					let command = `whitelist ${subcommand}`;
					if (subcommand == 'add' || subcommand == 'remove')
					{
						command += ' ' + interaction.options.getString('username');
					}

					await this.HandleCommand(command, interaction);
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('mc-command')
					.setDescription('Send a command to the minecraft server')
					.setDescriptionLocalization('fr', 'Envoyer une commande au serveur Minecraft')
					.setDefaultPermission(false)
					.addStringOption(option => option
						.setName('command')
						.setDescription('Command to send to the server (with no \'/\' at the start)')
						.setDescriptionLocalization('fr', 'Commande a envoyer au serveur (sans le \'/\' au début)')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction) =>
				{
					const command = interaction.options.getString('command');

					if (command == undefined)
					{
						throw 'no command specified.';
					}

					await this.HandleCommand(command, interaction);
				},
		},
	];

	private guildRcons: Map<string, Rcon> = new Map;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>): void
	{
		// eslint-disable-next-line no-empty-function
	}

	private async HandleCommand(command: string, interaction: CommandInteraction<CacheType>)
	{
		await interaction.deferReply();

		const rcon = this.GetGuildRcon(interaction.guild as Guild);
		await rcon.connect();

		let response = await rcon.send(command);
		response = this.CleanMinecraftTags(response);
		await rcon.end();
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