import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, CommandInteraction, Message, MessageEmbed, Role, RoleData, TextChannel } from 'discord.js';
import { Schema } from 'mongoose';
import fetch from 'node-fetch';

import { CatchAndLog, DatabaseModel, Plugin, Log } from '../plugin';

interface TopicType
{
	color: number,
	emoji: string,
	text: string,
}

const topicTypes: { [id: string]: TopicType } = {
	game: {
		color: 0xad5713,
		emoji: '🎮',
		text: 'Jeu',
	},
	music: {
		color: 0xa84300,
		emoji: '🎵',
		text: 'Musique',
	},
	subject: {
		color: 0xb96933,
		emoji: '💥',
		text: 'Sujet pratique',
	},
};

interface ITopic
{
	messageId: string,
	channelId: string,
	roleId: string,
	roleName: string,
}

const TopicSchema = new Schema<ITopic>({
	messageId: { type: String, required: true },
	channelId: { type: String, required: true },
	roleId: { type: String, required: true },
	roleName: { type: String, required: true },
});

// Fill choices to add in slashcommandbuilder
const choices: { name: string, value: string }[] = [];
for (const key in topicTypes) choices.push({ name: key, value: key });

const collectionName = 'topics';

class TopicsPlugin extends Plugin
{
	public name = 'Topics';
	public commands = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('topic')
					.setDescription('manage topics')
					.setDefaultPermission(false)
					.addSubcommand(sub => sub
						.setName('create')
						.setDescription('create a topic')
						.addStringOption(option => option
							.setName('name')
							.setDescription('name of the new topic')
							.setRequired(true))
						.addStringOption(option => option
							.setName('type')
							.setDescription('type of topic')
							.setRequired(true)
							.setChoices(...choices))
						.addStringOption(option => option
							.setName('image')
							.setDescription('link to an image URL')))
					.addSubcommand(sub => sub
						.setName('delete')
						.setDescription('delete a topic')
						.addRoleOption(option => option
							.setName('role')
							.setDescription('role of the topic')
							.setRequired(true)))
					.addSubcommand(sub => sub
						.setName('edit')
						.setDescription('edit a topic')
						.addRoleOption(option => option
							.setName('role')
							.setDescription('role of the topic')
							.setRequired(true))
						.addStringOption(option => option
							.setName('type')
							.setDescription('type of topic')
							.setRequired(true)
							.setChoices(...choices))
						.addStringOption(option => option
							.setName('name')
							.setDescription('name of the new topic'))
						.addStringOption(option => option
							.setName('image')
							.setDescription('link to an image URL'))) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					if (interaction.channel == undefined) throw 'undefined channel';

					await interaction.deferReply({ ephemeral: true });

					const subcommand = interaction.options.getSubcommand();

					if (subcommand == 'create')
					{
						const name = interaction.options.getString('name') as string;
						const type = interaction.options.getString('type') as string;
						const image = interaction.options.getString('image');
						const guild = interaction.guild;

						const topicDescr = topicTypes[type] ?? {};

						const Model = DatabaseModel(collectionName, TopicSchema, guild);

						// Create new Role
						const role = await interaction.guild?.roles.create({
							name: name,
							color: topicDescr.color,
						}) as Role;

						// Create embed
						const embed = new MessageEmbed({
							title: `${topicData.roleName} ${topicDescr.emoji} ${topicDescr.text}`,
							color: topicDescr.color,
							footer: { text: 'Clique sur ✅ pour t\'abonner à ce topic' },
						});

						// get image
						const files = [];
						if (image != undefined)
						{
							const res = await fetch(image);
							if (!res.ok) throw `Image request failed: ${res.status} ${res.statusText}`;

							// Create and send image buffer
							const buffer = Buffer.from(await res.arrayBuffer());

							embed.setImage('attachment://image.png');
							files.push({ attachment: buffer, name: 'image.png' });
						}

						// send image
						const message = await interaction.channel.send({ embeds: [ embed ], files: files });
						message.react('✅');

						// Add to cache
						this.messages.push(message);

						// Save to database
						const model = new Model({
							channelId: interaction.channelId,
							messageId: message.id,
							roleId: role.id,
							roleName: role.name,
						});
						model.save();
					}
					else if (subcommand == 'edit')
					{
						const role = interaction.options.getRole('role') as Role;
						const type = interaction.options.getString('type') as string;
						const name = interaction.options.getString('name') as string | undefined;
						const image = interaction.options.getString('image') as string | undefined;
						const guild = interaction.guild;

						const topicDescr = topicTypes[type] ?? {};

						const Model = DatabaseModel(collectionName, TopicSchema, guild);
						const topicData = await Model.findOne({ roleId: role.id });

						if (topicData == undefined) throw 'Topic not found';

						// Delete role
						const data: RoleData = {
							color: topicDescr.color,
							mentionable: true,
						};

						// Update name
						if (name != undefined)
						{
							data.name = name;
							topicData.roleName = name;
							topicData.save();
						}

						await role.edit(data);

						// Try to find topic message
						const channel = await guild?.channels.fetch(topicData.channelId).catch(() => undefined) as TextChannel;
						if (channel != undefined)
						{
							const topicMessage = await channel.messages.fetch(topicData.messageId).catch(() => undefined);
							if (topicMessage != undefined)
							{
								const embed = await topicMessage.embeds[0];

								embed.title = `${topicData.roleName} ${topicDescr.emoji} ${topicDescr.text}`;
								embed.color = topicDescr.color;
								embed.footer = { text: 'Clique sur ✅ pour t\'abonner à ce topic' };
								embed.setImage('attachment://image.png');

								if (image != undefined)
								{
									const res = await fetch(image);
									if (!res.ok) throw `Image request failed: ${res.status} ${res.statusText}`;

									// Create and send image buffer
									const buffer = Buffer.from(await res.arrayBuffer());

									await topicMessage.edit({ embeds: [ embed ], files: [{ attachment: buffer, name: 'image.png' }] });
								}
								else
								{
									await topicMessage.edit({ embeds: [ embed ] });
								}
							}
						}
					}
					else if (subcommand == 'delete')
					{
						const role = interaction.options.getRole('role') as Role;
						const guild = interaction.guild;

						const Model = DatabaseModel(collectionName, TopicSchema, guild);
						const topicData = await Model.findOne({ roleId: role.id });

						if (topicData == undefined) throw 'Topic not found';

						// Delete role
						await role.delete(`Deleted topic ${topicData.roleName}`);

						// Try to delete topic message
						const channel = await guild?.channels.fetch(topicData.channelId).catch(() => undefined) as TextChannel;
						if (channel != undefined)
						{
							const topicMessage = await channel.messages.fetch(topicData.messageId).catch(() => undefined);
							if (topicMessage != undefined)
							{
								await topicMessage.delete();
							}
						}

						topicData.delete();
					}

					// Acknowledge interaction
					switch (interaction.locale)
					{
					case 'fr':
						interaction.editReply({ content: 'Voila!' });
						break;
					default:
						interaction.editReply({ content: 'Done!' });
						break;
					}
				},
		},
	];

	private messages: Message[] = [];

	public Init(client: Client<boolean>): void
	{
		// Need to fetch all messages in order to receive reaction events
		client.guilds.cache.forEach(async guild =>
		{
			const Model = DatabaseModel(collectionName, TopicSchema, guild);
			const topicMessages = await Model.find({});

			topicMessages.forEach(async msg =>
			{
				const channel = await guild.channels.fetch(msg.channelId).catch(() => undefined);
				if (channel != undefined && channel instanceof TextChannel)
				{
					const message = await channel.messages.fetch(msg.messageId).catch(() => undefined);
					if (message != undefined)
					{
						this.messages.push(message);
					}
				}
			});

			Log(`Fetched ${this.messages.length} topic messages in guild ${guild.name}`);
		});

		client.on('messageReactionAdd', async (reaction, user) =>
		{
			CatchAndLog(async () =>
			{
				const bot = client.user;

				if (user == undefined || bot == undefined || user.id == bot.id) return;

				const Model = DatabaseModel(collectionName, TopicSchema, reaction.message.guild);
				const roleData = await Model.findOne({ channelId: reaction.message.channelId, messageId: reaction.message.id });

				if (roleData != undefined)
				{
					const members = await reaction.message.guild?.members.fetch();
					await members?.get(user.id)?.roles.add(roleData.roleId);
					Log(`${user.tag} added role ${roleData.roleName}`);
				}
			});
		});

		client.on('messageReactionRemove', async (reaction, user) =>
		{
			CatchAndLog(async () =>
			{
				const bot = client.user;

				if (user == undefined || bot == undefined || user.id == bot.id) return;

				const Model = DatabaseModel(collectionName, TopicSchema, reaction.message.guild);
				const roleData = await Model.findOne({ channelId: reaction.message.channelId, messageId: reaction.message.id });

				if (roleData != undefined)
				{
					const members = await reaction.message.guild?.members.fetch();
					await members?.get(user.id)?.roles.remove(roleData.roleId);
					Log(`${user.tag} removed role ${roleData.roleName}`);
				}
			});
		});
	}
}

(new TopicsPlugin()).Register();