import { BaseGuildTextChannel, Client } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { Plugin, PluginCommand } from '../plugin';

class CorePlugin extends Plugin
{
	public name = 'Core';

	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('delete')
					.setDescription('Delete the last # messages of this channel. Can\'t delete messages older than 15 days.')
					.setDescriptionLocalization('fr', 'Supprime les # derniers messages de ce channel. Les messages de plus de 15 jours seront ignorés.')
					.setDefaultPermission(false)
					.addIntegerOption(option => option
						.setName('amount')
						.setDescription('amount of messages to delete.')
						.setNameLocalization('fr', 'quantité')
						.setDescriptionLocalization('fr', 'quantité de messages a supprimer.')
						.setMinValue(1)
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction) =>
				{
					// Extract parameters
					const number = interaction.options.getInteger('amount') ?? 0;
					const channel : BaseGuildTextChannel = interaction.channel as BaseGuildTextChannel;

					// Check for valid context
					if (channel == undefined) { throw 'undefined channel'; }

					// delete messages
					const deletedMessages = await channel.bulkDelete(number, true);

					switch (interaction.locale)
					{
					case 'fr':
						await interaction.reply({ content: `${deletedMessages.size} messages supprimés.`, ephemeral: true });
						break;
					default:
						await interaction.reply({ content: `Deleted ${deletedMessages.size} messages.`, ephemeral: true });
						break;
					}
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('say')
					.setDescription('Makes the bot say something')
					.setDescriptionLocalization('fr', 'Faire dire quelque chose au bot')
					.setDefaultPermission(false)
					.addStringOption(option => option
						.setName('text')
						.setDescription('text to say')
						.setDescriptionLocalization('fr', 'texte a dire')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction) =>
				{
					const text : string | null = interaction.options.getString('text');

					if (text != undefined)
					{

						switch (interaction.locale)
						{
						case 'fr':
							interaction.reply({ content: 'Voila!', ephemeral: true });
							break;
						default:
							interaction.reply({ content: 'Done!', ephemeral: true });
							break;
						}

						interaction.channel?.send(text);
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

(new CorePlugin()).Register();