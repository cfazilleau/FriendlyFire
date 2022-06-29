import { SlashCommandBuilder } from '@discordjs/builders';
import { ButtonInteraction, CacheType, Client, CommandInteraction, MessageActionRow, MessageButton, TextChannel } from 'discord.js';
import QuickChart from 'quickchart-js';

import { Plugin, PluginCommand, RegisterPlugin } from '../pluginloader';
import { Log } from '../utils';

interface MessageVotes
{
	[guild: string]: {
		[channel: string]: {
			[messageId: string]: {
				[userId: string]: string;
			}
		}
	}
}

// TODO: find a way to store localData in a persistent database / filesystem (mongoose ?)
let localData: MessageVotes = {};
function LoadMessageVotesData(): MessageVotes
{
	return localData;
	// return this.GetProperty('userVotes', {});
}

function SaveMessageVotesData(data: MessageVotes)
{
	localData = data;
	// return this.SetProperty('userVotes', data);
}

class PollsPlugin extends Plugin
{
	public name = 'Polls';
	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('yn')
					.setDescription('send a poll with yes and no answers')
					.addStringOption(option => option
						.setName('poll')
						.setDescription('poll question')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					const text = interaction.options.getString('poll');

					const actionRow = new MessageActionRow();
					actionRow.addComponents([
						this.yesButton,
						this.noButton,
					]);

					interaction.reply({ content: text, components: [ actionRow ], fetchReply: true });
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('ynu')
					.setDescription('send a poll with yes, no, and maybe answers')
					.addStringOption(option => option
						.setName('poll')
						.setDescription('poll question')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					const text = interaction.options.getString('poll');

					const actionRow = new MessageActionRow();
					actionRow.addComponents([
						this.yesButton,
						this.noButton,
						this.maybeButton,
					]);

					interaction.reply({ content: text, components: [ actionRow ], fetchReply: true });
				},
		},
	];

	private yesButton = new MessageButton()
		.setCustomId(this.CustomId('yes'))
		.setLabel('Yes')
		.setStyle('SUCCESS')
		.setEmoji('👍');

	private noButton = new MessageButton()
		.setCustomId(this.CustomId('no'))
		.setLabel('No')
		.setStyle('DANGER')
		.setEmoji('👎');

	private maybeButton = new MessageButton()
		.setCustomId(this.CustomId('maybe'))
		.setLabel('Maybe')
		.setStyle('PRIMARY')
		.setEmoji('✋');

	public Init(client: Client<boolean>): void
	{
		client.on('interactionCreate', interaction =>
		{
			if (interaction.isButton() && this.CheckCustomId(interaction.customId))
			{
				const customId = this.GetShortCustomId(interaction.customId);
				Log(`Handling interaction '${customId}' from '${interaction.user.username}'`);

				this.HandleButtonInteraction(interaction);
			}
		});

		this.ClearOldVoteMessages(client);
	}

	private CustomId(id: string): string
	{
		Log(this.name);
		return `${this.name}.${id}`;
	}

	private CheckCustomId(id: string): boolean
	{
		return id.startsWith(`${this.name}.`);
	}

	private GetShortCustomId(id: string): string
	{
		return id.replace(`${this.name}.`, '');
	}

	private GetMessageVotes(guild: string, channel: string, message: string): {[userId: string]: string}
	{
		const messageVotes: MessageVotes = this.GetProperty('userVotes', {});
		const guildData = messageVotes[guild] ?? {};
		const chanData = guildData[channel] ?? {};
		return chanData[message] ?? {};
	}



	private SetMessageVotes(guild: string, channel: string, message: string, data: {[userId: string]: string})
	{
		// Get Data
		const messageVotes: MessageVotes = LoadMessageVotesData();
		const guildData = messageVotes[guild] ?? {};
		const chanData = guildData[channel] ?? {};

		// Set Data
		chanData[message] = data;
		guildData[channel] = chanData;
		messageVotes[guild] = guildData;
		SaveMessageVotesData(messageVotes);
	}

	private async ClearOldVoteMessages(client: Client<boolean>)
	{
		// Check guilds
		const guilds: MessageVotes = LoadMessageVotesData();
		for (const guildId in guilds)
		{
			await client.guilds.fetch();
			const guild = await client.guilds.cache.get(guildId);
			Log(`${guild?.name}`);
			if (guild == undefined)
			{
				delete guilds[guildId];
				continue;
			}

			// Check channels
			const channels = guilds[guildId];
			for (const channelId in channels)
			{
				await guild.channels.fetch();
				const channel = await guild.channels.cache.get(channelId) as TextChannel | undefined;
				Log(`${channel?.name}`);
				if (channel == undefined)
				{
					delete channels[channelId];
					continue;
				}

				// Check messages
				const messages = channels[channelId];
				for (const messageId in messages)
				{
					await channel.messages.fetch();
					const message = await channel.messages.cache.get(messageId);
					Log(`${message?.content}`);
					if (message == undefined)
					{
						delete messages[messageId];
						continue;
					}
				}

				if (Object.keys(messages).length == 0)
				{
					delete channels[channelId];
				}
			}

			if (Object.keys(channels).length == 0)
			{
				delete guilds[guildId];
			}
		}

		SaveMessageVotesData(guilds);
	}

	private async HandleButtonInteraction(interaction: ButtonInteraction)
	{
		try
		{
			const guildId = interaction.guildId as string;
			const chanId = interaction.channelId;
			const msgId = interaction.message.id;
			const message = await interaction.channel?.messages.fetch(msgId);

			const userVotes: {[userId: string]: string} = this.GetMessageVotes(guildId, chanId, msgId);

			userVotes[interaction.user.id] = this.GetShortCustomId(interaction.customId);

			this.SetMessageVotes(guildId, chanId, msgId, userVotes);

			const values = new Map<string, number>();
			for (const value in userVotes)
			{
				const vote: string = userVotes[value];
				const count: number = values.get(vote) ?? 0;
				values.set(vote, count + 1);
			}

			const yesCount = values.get('yes');
			const noCount = values.get('no');
			const maybeCount = values.get('maybe');

			const chart = new QuickChart();
			chart.setWidth(1024);
			chart.setHeight(128);
			chart.setBackgroundColor('#00000000');
			chart.setConfig(
				{
					'type': 'horizontalBar',
					'data':
					{
						'datasets': [
							{ 'data': [ yesCount ?? 0 ], hidden: yesCount == undefined, 'backgroundColor': '#43b581' },
							{ 'data': [ noCount ?? 0 ], hidden: noCount == undefined, 'backgroundColor': '#f04747' },
							{ 'data': [ maybeCount ?? 0 ], hidden: maybeCount == undefined, 'backgroundColor': '#5865f2' },
						],
					},
					'options':
					{
						'legend': { 'display': false },
						'scales': {
							'xAxes': [{ 'display': false, 'stacked': true }],
							'yAxes': [{ 'display': false, 'stacked': true }],
						},
						'plugins':
						{
							'datalabels': {
								'color': '#ffffff',
								'font': {
									'family': 'roboto',
									'size': 50,
								},
							},
						},
					},
				});

			await message?.edit({ files: [{ attachment: await chart.toBinary(), name: 'chart.png' }] });
			await interaction.update({});
		}
		catch (error)
		{
			Log(`${error}`);
			interaction.reply(`${error}`);
		}
	}
}

RegisterPlugin(new PollsPlugin());