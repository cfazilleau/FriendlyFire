import { ContextMenuCommandBuilder, SlashCommandBuilder } from '@discordjs/builders';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { ButtonInteraction, CacheType, Client, CommandInteraction, ContextMenuInteraction, Guild, Message, MessageActionRow, MessageButton, MessageEmbed, TextChannel } from 'discord.js';
import { Schema } from 'mongoose';
import QuickChart from 'quickchart-js';

import { Log, Plugin, PluginCommand, DatabaseModel, CatchAndLog } from '../plugin';

interface IMessageVotes
{
	messageId: string,
	channelId: string,
	creationTimestamp: number,
	locked: boolean,
	votes: { [userId: string]: string },
}

const MessageVotesSchema = new Schema<IMessageVotes>({
	messageId: { type: String, required: true },
	channelId: { type: String, required: true },
	creationTimestamp: { type: Number, required: true },
	locked: { type: Boolean, default: false },
	votes: { type: Object, default: {} },
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
					.setDescription('Send a poll with the answers \'Yes\' and \'No\'')
					.setDescriptionLocalization('fr', 'Envoyer un sondage avec les réponses \'Oui\' et \'Non\'')
					.addStringOption(option => option
						.setName('poll')
						.setDescription('Poll question')
						.setDescriptionLocalization('fr', 'Question du sondage')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					const text = interaction.options.getString('poll');

					if (text == undefined) throw 'poll text can not be empty';

					await this.SendPoll(interaction, text, [
						new MessageButton({
							customId: this.CustomId('yes'),
							label: interaction.locale == 'fr' ? 'Oui' : 'Yes',
							style: 'SUCCESS',
							emoji: '👍',
						}),
						new MessageButton({
							customId: this.CustomId('no'),
							label: interaction.locale == 'fr' ? 'Non' : 'No',
							style: 'DANGER',
							emoji: '👎',
						}),
					]);
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('ynu')
					.setDescription('Send a poll with the answers \'Yes\', \'No\', and \'Maybe\'')
					.setDescriptionLocalization('fr', 'Envoyer un sondage avec les réponses \'Oui\', \'Non\', et \'Peut-être\'')
					.addStringOption(option => option
						.setName('poll')
						.setDescription('Poll question')
						.setDescriptionLocalization('fr', 'Question du sondage')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					const text = interaction.options.getString('poll');

					if (text == undefined) throw 'poll text can not be empty';

					await this.SendPoll(interaction, text, [
						new MessageButton({
							customId: this.CustomId('yes'),
							label: interaction.locale == 'fr' ? 'Oui' : 'Yes',
							style: 'SUCCESS',
							emoji: '👍',
						}),
						new MessageButton({
							customId: this.CustomId('no'),
							label: interaction.locale == 'fr' ? 'Non' : 'No',
							style: 'DANGER',
							emoji: '👎',
						}),
						new MessageButton({
							customId: this.CustomId('maybe'),
							label: interaction.locale == 'fr' ? 'Peut-être' : 'Maybe',
							style: 'PRIMARY',
							emoji: '✋',
						}),
					]);
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('poll')
					.setDescription('Send a poll with up to 5 custom answers')
					.setDescriptionLocalization('fr', 'Envoyer un sondage avec jusqu\'a 5 réponses personnalisées')
					.addStringOption(option => option
						.setName('poll')
						.setDescription('Poll question')
						.setDescriptionLocalization('fr', 'Question du sondage')
						.setRequired(true))
					.addStringOption(option => option
						.setName('option_1')
						.setDescription('Option 1')
						.setRequired(true))
					.addStringOption(option => option
						.setName('option_2')
						.setDescription('Option 2')
						.setRequired(true))
					.addStringOption(option => option
						.setName('option_3')
						.setDescription('Option 3'))
					.addStringOption(option => option
						.setName('option_4')
						.setDescription('Option 4'))
					.addStringOption(option => option
						.setName('option_5')
						.setDescription('Option 5')) as SlashCommandBuilder,
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
		{
			builder:
				new ContextMenuCommandBuilder()
					.setName('Lock or Unlock Poll')
					.setType(ApplicationCommandType.Message)
					.setDefaultPermission(false),
			callback:
				async (interaction: ContextMenuInteraction) =>
				{
					if (!interaction.isMessageContextMenu())
					{
						throw 'Interaction was not a message context menu';
					}

					await interaction.deferReply({ ephemeral: true });

					const guild = interaction.guild;
					const message = interaction.targetMessage;

					const MessageVotes = DatabaseModel(collectionName, MessageVotesSchema, guild);
					const messageVotes = await MessageVotes.findOne({ messageId: message.id });

					if (messageVotes == undefined || !(message instanceof Message))
					{
						await interaction.editReply({ content: 'Selected message is not a poll or wasn\'t found on the database.' });
						return;
					}

					const locked = !messageVotes.locked;
					await messageVotes.updateOne({ locked: locked });

					await this.UpdatePoll(message, messageVotes.votes, locked);

					switch (interaction.locale)
					{
					case 'fr':
						await interaction.editReply({ content: `Sondage ${ locked ? 'Vérouillé' : 'Déverouillé' }` });
						break;
					default:
						await interaction.editReply({ content: `Poll ${ locked ? 'Locked' : 'Unlocked' }` });
						break;
					}
				},
		},
	];

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
					Log(`Handling interaction '${customId}' from '${interaction.user.tag}'`);

					await this.HandleButtonInteraction(interaction);
				}
			}, interaction.channel);
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

		const messageVotes = await MessageVotes.findOne({ channelId: channelId, messageId: messageId });
		return (messageVotes as unknown as IMessageVotes)?.votes ?? {};
	}

	private async SetMessageVotes(guild: Guild, channelId: string, messageId: string, data: {[userId: string]: string})
	{
		const MessageVotes = DatabaseModel(collectionName, MessageVotesSchema, guild);

		await MessageVotes.findOneAndUpdate({ channelId: channelId, messageId: messageId }, { votes: data }, { upsert: true });
	}

	private async ClearOldVoteMessages(client: Client<boolean>)
	{
		await client.guilds.fetch();
		client.guilds.cache.forEach(async guild =>
		{
			Log(`Clearing old votes in ${guild?.name}...`);
			const MessageVotes = DatabaseModel(collectionName, MessageVotesSchema, guild);

			const messages = await MessageVotes.find();
			messages.forEach(async msg =>
			{
				try
				{
					// check correct channel
					const channel = await guild.channels.fetch(msg.channelId) as TextChannel;
					// check correct message
					await channel.messages.fetch(msg.messageId);
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
		const embed = new MessageEmbed({ title: poll });

		const pollMessage = await interaction.reply({ embeds: [ embed ], components: [ actionRow ], fetchReply: true }) as Message;

		await this.UpdatePoll(pollMessage, {});
	}

	private async HandleButtonInteraction(interaction: ButtonInteraction)
	{
		const guild = interaction.guild as Guild;
		const chanId = interaction.channelId;
		const msgId = interaction.message.id;
		const message = await interaction.channel?.messages.fetch(msgId);

		if (message == undefined) throw 'Undefined message';

		const userVotes: {[userId: string]: string} = await this.GetMessageVotes(guild, chanId, msgId);
		userVotes[interaction.user.id] = this.GetShortCustomId(interaction.customId);

		await this.UpdatePoll(message, userVotes);
	}

	private async UpdatePoll(message: Message<boolean>, votes: { [userId: string]: string }, locked = false)
	{
		await this.SetMessageVotes(message.guild as Guild, message.channelId, message.id, votes);

		const options = [ 'option_1', 'option_2', 'option_3', 'option_4', 'option_5', 'yes', 'no', 'maybe' ];
		const colors = [ '#78b159', '#55acee', '#aa8ed6', '#dd2e44', '#f4900c', '#43b581', '#f04747', '#5865f2' ];

		// Count votes and create chart
		const count = new Array<number>(options.length);
		for (const key in votes)
		{
			const index = options.indexOf(votes[key]);
			if (index > 0 && index < count.length)
			{
				count[index]++;
			}
		}

		const chart = this.CreateChart(count, colors);

		// Lock / Unlock buttons
		const row = message.components.at(0) as MessageActionRow;
		row.components.forEach(button =>
		{
			if (button instanceof MessageButton)
			{
				button.setDisabled(locked);
			}
		});

		// Update Lock indicator
		const embed = message.embeds.at(0) as MessageEmbed;
		embed.setImage('attachment://chart.png');
		embed.setFooter({ text: locked ? '🔒 Sondage verouillé' : '' });

		// Update message
		await message.edit({ embeds: [ embed ], components: [ row ], files: [{ attachment: await chart.toBinary(), name: 'chart.png' }] });
	}

	private CreateChart(voteCounts: number[], colors: string[])
	{
		// Chart base config
		const config: Chart.ChartConfiguration = {
			type: 'horizontalBar',
			data:
			{
				datasets: [],
			},
			options:
			{
				legend: { display: false },
				scales: {
					xAxes: [{ display: false, stacked: true }],
					yAxes: [{ display: false, stacked: true }],
				},
				plugins:
				{
					datalabels: {
						color: '#ffffff',
						font: { family: 'roboto', size: 50 },
					},
				},
			},
		};

		// Add datasets
		for (let i = 0; i < voteCounts.length; i++)
		{
			const vote = voteCounts[i];
			config.data?.datasets?.push({
				data: [ vote ],
				hidden: vote == 0,
				backgroundColor: colors[i],
			});
		}

		// Generate chart
		const chart = new QuickChart();
		chart.setWidth(1024);
		chart.setHeight(128);
		chart.setBackgroundColor('#00000000');
		chart.setConfig(config);
		return chart;
	}
}

(new PollsPlugin()).Register();