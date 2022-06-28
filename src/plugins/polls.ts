import { SlashCommandBuilder } from '@discordjs/builders';
import { ButtonInteraction, CacheType, Client, CommandInteraction, MessageActionRow, MessageButton } from 'discord.js';
import QuickChart from 'quickchart-js';

import { Plugin, PluginCommand, RegisterPlugin } from '../pluginloader';

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
						new MessageButton()
							.setCustomId('yes')
							.setLabel('Yes')
							.setStyle('SUCCESS')
							.setEmoji('👍'),
						new MessageButton()
							.setCustomId('no')
							.setLabel('No')
							.setStyle('DANGER')
							.setEmoji('👎'),
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
						new MessageButton()
							.setCustomId('yes')
							.setLabel('Yes')
							.setStyle('SUCCESS')
							.setEmoji('👍'),
						new MessageButton()
							.setCustomId('no')
							.setLabel('No')
							.setStyle('DANGER')
							.setEmoji('👎'),
						new MessageButton()
							.setCustomId('maybe')
							.setLabel('Maybe')
							.setStyle('PRIMARY')
							.setEmoji('✋'),
					]);

					interaction.reply({ content: text, components: [ actionRow ], fetchReply: true });
				},
		},
	];

	public Init(client: Client<boolean>): void
	{
		client.on('interactionCreate', interaction =>
		{
			if (interaction.isButton())
			{
				this.HandleButtonInteraction(interaction);
			}
		});
	}

	private userVotes: Map<string, Map<string, string>> = new Map;

	private async HandleButtonInteraction(interaction: ButtonInteraction)
	{
		try
		{
			const msgId = interaction.message.id;
			const message = await interaction.channel?.messages.fetch(msgId);

			const userVotes: Map<string, string> = this.userVotes.get(msgId) ?? new Map;
			userVotes.set(interaction.user.id, interaction.customId);
			this.userVotes.set(msgId, userVotes);

			const values = new Map<string, number>();
			userVotes.forEach((value) =>
			{
				const cur : number = values.get(value) ?? 0;
				values.set(value, cur + 1);
			});

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
							{ 'data': [ values.get('yes') ?? 0 ], hidden: values.get('yes') == undefined, 'backgroundColor': '#43b581' },
							{ 'data': [ values.get('no') ?? 0 ], hidden: values.get('no') == undefined, 'backgroundColor': '#f04747' },
							{ 'data': [ values.get('maybe') ?? 0 ], hidden: values.get('maybe') == undefined, 'backgroundColor': '#5865f2' },
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
			interaction.reply(`${error}`);
		}
	}
}

RegisterPlugin(new PollsPlugin());