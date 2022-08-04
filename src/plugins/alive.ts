import { SlashCommandBuilder } from '@discordjs/builders';
import { ActivityOptions, Client, CommandInteraction, ExcludeEnum, PresenceStatusData, TextChannel } from 'discord.js';
import { ActivityTypes } from 'discord.js/typings/enums';
import { Log, CatchAndLog, Plugin } from '../plugin';

class AlivePlugin extends Plugin
{
	public name = 'Alive';
	public commands = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('status')
					.setDescription('set current bot status')
					.setDefaultPermission(false)
					.addStringOption(option => option
						.setName('status')
						.setDescription('status of the bot')
						.addChoices(
							{ name: 'online', value: 'online' },
							{ name: 'do not disturb', value: 'dnd' },
							{ name: 'idle', value: 'idle' },
							{ name: 'invisible', value: 'invisible' },
						)
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					await interaction.deferReply({ ephemeral: true });

					const status = interaction.options.getString('status') as PresenceStatusData;

					Log(`Setting status to ${status}`);

					await interaction.client.user?.setStatus(status);
					this.SetProperty('status', status);

					switch (interaction.locale)
					{
					case 'fr':
						await interaction.editReply({ content: 'Voila!' });
						break;
					default:
						await interaction.editReply({ content: 'Done!' });
						break;
					}
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('activity')
					.setDescription('manage current bot activity')
					.setDefaultPermission(false)
					.addSubcommand(command => command
						.setName('set')
						.setDescription('set current bot activity')
						.addStringOption(option => option
							.setName('type')
							.setDescription('type of presence')
							.setRequired(true)
							.addChoices(
								{ name: 'playing', value: 'PLAYING' },
								{ name: 'streaming', value: 'STREAMING' },
								{ name: 'listening', value: 'LISTENING' },
								{ name: 'watching', value: 'WATCHING' },
								{ name: 'competing', value: 'COMPETING' }))
						.addStringOption(option => option
							.setName('text')
							.setDescription('activity text')
							.setRequired(true))
						.addStringOption(option => option
							.setName('url')
							.setDescription('twitch.tv or youtube only link (to use with \'streaming\' type)')))
					.addSubcommand(command => command
						.setName('clear')
						.setDescription('clear current bot activity')) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					await interaction.deferReply({ ephemeral: true });

					const subcommand = interaction.options.getSubcommand();

					if (subcommand == 'set')
					{
						const type = interaction.options.getString('type') as ExcludeEnum<typeof ActivityTypes, 'CUSTOM'>;
						const text = interaction.options.getString('text') as string;
						const url = interaction.options.getString('url') as string | undefined;

						const options: ActivityOptions = { type: type, name: text, url: url };
						await interaction.client.user?.setActivity(options);
						this.SetProperty('activity', options);

						Log(`Set activity to ${type} ${text} with url '${url}'`);
					}
					else
					{
						await interaction.client.user?.setActivity();
						this.SetProperty('activity', null);
						Log('Cleared activity');
					}

					switch (interaction.locale)
					{
					case 'fr':
						await interaction.editReply({ content: 'Voila!' });
						break;
					default:
						await interaction.editReply({ content: 'Done!' });
						break;
					}
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('avatar')
					.setDescription('set bot avatar')
					.setDefaultPermission(false)
					.addAttachmentOption(option => option
						.setName('avatar')
						.setDescription('new bot avatar')) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					await interaction.deferReply({ ephemeral: true });

					const avatar = interaction.options.getAttachment('avatar')?.url;
					if (avatar)
					{
						Log(`Previous avatar url ${interaction.client.user?.avatarURL({ format: 'png', size: 2048 })}`);
						await interaction.client.user?.setAvatar(avatar);
						Log(`Set avatar to url '${avatar}'`);
					}

					switch (interaction.locale)
					{
					case 'fr':
						await interaction.editReply({ content: 'Voila!' });
						break;
					default:
						await interaction.editReply({ content: 'Done!' });
						break;
					}
				},
		},
	];

	public Init(client: Client<boolean>): void
	{
		client.on('messageCreate', message =>
		{
			CatchAndLog(() =>
			{
				if (message.mentions.users.has(client.user?.id ?? ''))
				{
					message.react('👀');
				}
			}, message.channel as TextChannel);
		});

		// Set cached status
		const status = this.GetProperty('status', undefined) as PresenceStatusData | undefined;
		if (status != undefined)
		{
			client.user?.setStatus(status);
			Log(`Set status back to ${status}`);
		}

		// Set cached activity
		const activity = this.GetProperty('activity', undefined) as ActivityOptions | undefined;
		if (activity != undefined)
		{
			client.user?.setActivity(activity);
			Log(`Set activity back to ${activity.type} ${activity.name} with url '${activity.url}'`);
		}
	}
}

(new AlivePlugin()).Register();