import { BaseGuildTextChannel, Client, CommandInteraction, ContextMenuInteraction, Message, TextChannel, User } from 'discord.js';
import { ContextMenuCommandBuilder, SlashCommandBuilder } from '@discordjs/builders';

import { Plugin, PluginCommand } from '../plugin';
import { ApplicationCommandType } from 'discord-api-types/v10';

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
						.setRequired(true))
					.addUserOption(option => option
						.setName('user')
						.setDescription('user to delete messages.')
						.setNameLocalization('fr', 'utilisateur')
						.setDescriptionLocalization('fr', 'utilisateur auquel supprimer les messages.')) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					// Extract parameters
					const number = interaction.options.getInteger('amount') ?? 0;
					const channel = interaction.channel as BaseGuildTextChannel;
					const user = interaction.options.getUser('user') as User;

					// Check for valid context
					if (channel == undefined) { throw 'undefined channel'; }

					let deletedMessagesCount: number;
					if (user != null)
					{
						let i = 0;
						const messages = (await channel.messages.fetch()).filter(msg => msg.author.id == user.id && i++ < number);
						deletedMessagesCount = (await channel.bulkDelete(messages, true)).size;
					}
					else
					{
						deletedMessagesCount = await (await channel.bulkDelete(number, true)).size;
					}

					switch (interaction.locale)
					{
					case 'fr':
						await interaction.reply({ content: `${deletedMessagesCount} messages supprimés.`, ephemeral: true });
						break;
					default:
						await interaction.reply({ content: `Deleted ${deletedMessagesCount} messages.`, ephemeral: true });
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
				async (interaction: CommandInteraction) =>
				{
					const text : string | null = interaction.options.getString('text');

					if (text != undefined)
					{
						switch (interaction.locale)
						{
						case 'fr':
							await interaction.reply({ content: 'Voila!', ephemeral: true });
							break;
						default:
							await interaction.reply({ content: 'Done!', ephemeral: true });
							break;
						}

						await interaction.channel?.send(text);
					}
				},
		},
		{
			builder:
				new ContextMenuCommandBuilder()
					.setName('Delete following messages')
					.setType(ApplicationCommandType.Message)
					.setDefaultPermission(false) as ContextMenuCommandBuilder,
			callback:
				async (interaction: ContextMenuInteraction) =>
				{
					if (!interaction.isMessageContextMenu()) throw 'Interaction is not a Message context menu.';

					const message = interaction.targetMessage as Message;
					const channel = message.channel as TextChannel;

					if (message == undefined || channel == undefined) throw 'Message or Channel is undefined.';

					const messages = (await channel.messages.fetch({ after: message.id }));
					const deletedMessages = await channel.bulkDelete(messages, true);

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
	];

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>) : void
	{
		// eslint-disable-next-line no-empty-function
	}
}

(new CorePlugin()).Register();