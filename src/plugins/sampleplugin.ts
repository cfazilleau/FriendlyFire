// This file is a template file to be used as a model for custom plugins

import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, CommandInteraction, PresenceStatusData } from 'discord.js';
import { Log, Plugin } from '../plugin';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SamplePlugin extends Plugin
{
	public name = 'SamplePlugin';
	public commands = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('sample-command')
					.setDescription('command to be used as an example')
					.setDefaultPermission(false) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					await interaction.deferReply({ ephemeral: true });

					const status = interaction.options.getString('status') as PresenceStatusData;

					Log(`Setting status to ${status}`, [ interaction.guild?.name ]);

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
	];

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>) : void
	{
		// eslint-disable-next-line no-empty-function
	}
}

// (new SamplePlugin()).Register();