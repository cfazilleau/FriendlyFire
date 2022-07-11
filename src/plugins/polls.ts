import { SlashCommandBuilder } from '@discordjs/builders';
import { ButtonInteraction, CacheType, Client, CommandInteraction, Guild, MessageActionRow, MessageButton, TextChannel } from 'discord.js';
import { Schema } from 'mongoose';
import QuickChart from 'quickchart-js';

import { Log, Plugin, PluginCommand, DatabaseModel, CatchAndLog } from '../plugin';

interface IMessageVotes
{
	id: string,
	votes: { [userId: string]: string },
}

const MessageVotesSchema = new Schema<IMessageVotes>({
	id: { type: String },
	votes: { type: Object, 'default': {} },
});

const collectionName = 'polls';

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

					if (text == undefined) throw 'poll text can not be empty';

					await this.SendPoll(interaction, text, [
						this.yesButton,
						this.noButton,
					]);
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

					if (text == undefined) throw 'poll text can not be empty';

					await this.SendPoll(interaction, text, [
						this.yesButton,
						this.noButton,
						this.maybeButton,
					]);
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('poll')
					.setDescription('send a poll with up to 5 custom answers')
					.addStringOption(option => option
						.setName('poll')
						.setDescription('poll question')
						.setRequired(true))
					.addStringOption(option => option
						.setName('option_1')
						.setDescription('option 1')
						.setRequired(true))
					.addStringOption(option => option
						.setName('option_2')
						.setDescription('option 2')
						.setRequired(true))
					.addStringOption(option => option
						.setName('option_3')
						.setDescription('option 3'))
					.addStringOption(option => option
						.setName('option_4')
						.setDescription('option 4'))
					.addStringOption(option => option
						.setName('option_5')
						.setDescription('option 5')) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					const text = interaction.options.getString('poll');
					if (text == undefined) throw 'poll text can not be empty';

					const emojis = ['🟢', '🔵', '🟣', '🔴', '🟠', '🟡'];

					const buttons: MessageButton[] = [];
					for (let i = 1; i <= 5; i++)
					{
						const id = `option_${i}`;
						const name = interaction.options.getString(id)?.substring(0, 80); // clamp length to 80

						if (name == undefined) continue;

						buttons.push(new MessageButton({
							customId: this.CustomId(id),
							label: name,
							style: 'SECONDARY',
							emoji: emojis[i - 1],
						}));
					}
					if (buttons.length < 2) throw 'custom polls must have at least 2 options';

					await this.SendPoll(interaction, text, buttons);
				},
		},
	];

	private yesButton = new MessageButton({
		customId: this.CustomId('yes'),
		label: 'Yes',
		style: 'SUCCESS',
		emoji: '👍',
	});

	private noButton = new MessageButton({
		customId: this.CustomId('no'),
		label: 'No',
		style: 'DANGER',
		emoji: '👎',
	});

	private maybeButton = new MessageButton({
		customId: this.CustomId('maybe'),
		label: 'Maybe',
		style: 'PRIMARY',
		emoji: '✋',
	});

	public Init(client: Client<boolean>): void
	{
		client.on('interactionCreate', interaction =>
		{
			CatchAndLog(async () =>
			{
				if (interaction.isButton() && this.CheckCustomId(interaction.customId))
				{
					await interaction.deferUpdate();

					const customId = this.GetShortCustomId(interaction.customId);
					Log(`Handling interaction '${customId}' from '${interaction.user.username}'`);

					await this.HandleButtonInteraction(interaction);
				}
			}, interaction);
		});

		CatchAndLog(async () =>
		{
			this.ClearOldVoteMessages(client);
		});
	}

	private CustomId(id: string): string
	{
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

	private async GetMessageVotes(guild: Guild, channelId: string, messageId: string): Promise<{ [userId: string]: string }>
	{
		const MessageVotes = DatabaseModel(collectionName, MessageVotesSchema, guild);
		const id = `${channelId}.${messageId}`;

		const messageVotes = await MessageVotes.findOne({ id: id });
		return (messageVotes as unknown as IMessageVotes)?.votes ?? {};
	}

	private async SetMessageVotes(guild: Guild, channelId: string, messageId: string, data: {[userId: string]: string})
	{
		const MessageVotes = DatabaseModel(collectionName, MessageVotesSchema, guild);
		const id = `${channelId}.${messageId}`;

		await MessageVotes.findOneAndUpdate({ id: id }, { votes: data }, { upsert: true });
	}

	private async ClearOldVoteMessages(client: Client<boolean>)
	{
		await client.guilds.fetch();
		client.guilds.cache.forEach(async guild =>
		{
			Log(`Clearing old invites in ${guild?.name}...`);
			const MessageVotes = DatabaseModel(collectionName, MessageVotesSchema, guild);

			const messages = await MessageVotes.find();
			messages.forEach(async msg =>
			{
				// check correct id
				const id = msg.id.split('.');
				if (id.length != 2)
				{
					msg.delete();
					return;
				}

				const channelId = id[0];
				const messageId = id[1];

				try
				{
					// check correct channel
					const channel = await guild.channels.fetch(channelId) as TextChannel;
					// check correct message
					await channel.messages.fetch(messageId);
				}
				catch (_)
				{
					msg.delete();
					return;
				}
			});
		});
	}

	private async SendPoll(interaction: CommandInteraction, poll: string, buttons: MessageButton[])
	{
		const actionRow = new MessageActionRow({ components: buttons });
		await interaction.reply({ content: poll, components: [ actionRow ] });
	}

	private async HandleButtonInteraction(interaction: ButtonInteraction)
	{
		const guild = interaction.guild as Guild;
		const chanId = interaction.channelId;
		const msgId = interaction.message.id;
		const message = await interaction.channel?.messages.fetch(msgId);

		const userVotes: {[userId: string]: string} = await this.GetMessageVotes(guild, chanId, msgId);
		userVotes[interaction.user.id] = this.GetShortCustomId(interaction.customId);

		await this.SetMessageVotes(guild, chanId, msgId, userVotes);

		const values = new Map<string, number>();
		for (const value in userVotes)
		{
			const vote: string = userVotes[value];
			const count: number = values.get(vote) ?? 0;
			values.set(vote, count + 1);
		}

		const count: number[] | undefined[] = [];

		for (let i = 1; i <= 5; i++) { count[i - 1] = values.get(`option_${i}`); }
		count[5] = values.get('yes');
		count[6] = values.get('no');
		count[7] = values.get('maybe');

		const chart = new QuickChart();
		chart.setWidth(1024);
		chart.setHeight(128);
		chart.setBackgroundColor('#00000000');
		chart.setConfig({
			'type': 'horizontalBar',
			'data':
			{
				'datasets': [
					{ 'data': [ count[0] ?? 0 ], hidden: count[0] == undefined, 'backgroundColor': '#78b159' }, // option_1
					{ 'data': [ count[1] ?? 0 ], hidden: count[1] == undefined, 'backgroundColor': '#55acee' }, // option_2
					{ 'data': [ count[2] ?? 0 ], hidden: count[2] == undefined, 'backgroundColor': '#aa8ed6' }, // option_3
					{ 'data': [ count[3] ?? 0 ], hidden: count[3] == undefined, 'backgroundColor': '#dd2e44' }, // option_4
					{ 'data': [ count[4] ?? 0 ], hidden: count[4] == undefined, 'backgroundColor': '#f4900c' }, // option_5
					{ 'data': [ count[5] ?? 0 ], hidden: count[5] == undefined, 'backgroundColor': '#43b581' }, // yes
					{ 'data': [ count[6] ?? 0 ], hidden: count[6] == undefined, 'backgroundColor': '#f04747' }, // no
					{ 'data': [ count[7] ?? 0 ], hidden: count[7] == undefined, 'backgroundColor': '#5865f2' }, // maybe
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
	}
}

(new PollsPlugin()).Register();