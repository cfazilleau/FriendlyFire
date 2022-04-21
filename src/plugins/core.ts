import { BaseGuildTextChannel, Client } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { CommandCallback, Plugin, RegisterPlugin } from '../pluginloader';

class CorePlugin extends Plugin
{
	public name = 'Core';

	public commands: { builder: RESTPostAPIApplicationCommandsJSONBody, callback: CommandCallback }[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('delete')
					.setDescription('Delete the last # messages of this channel. Can\'t delete messages older than 15 days.')
					.setDescriptionLocalization('fr', 'Supprime les # derniers messages de ce channel. Les messages datants de plus de 15 jours seront ignorés.')
					.addIntegerOption(option => option
						.setName('amount')
						.setDescription('amount of messages to delete.')
						.setNameLocalization('fr', 'quantité')
						.setDescriptionLocalization('fr', 'quantité de messages a supprimer.')
						.setMinValue(1)
						.setRequired(true))
					.toJSON(),
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
					await interaction.reply({ content: `Deleted ${deletedMessages.size} messages.`, ephemeral: true });
				},
		},
	];

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>) : void
	{
		// eslint-disable-next-line no-empty-function
	}
}

RegisterPlugin(new CorePlugin());