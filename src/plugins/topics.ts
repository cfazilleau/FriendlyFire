import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, CommandInteraction, Message, MessageEmbed, Role, TextChannel } from 'discord.js';
import { Schema } from 'mongoose';

import { CatchAndLog, DatabaseModel, Plugin, Log } from '../plugin';

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
							.setChoices(
								{ name: 'game', value: 'game' },
								{ name: 'thread', value: 'thread' },
							))
						.addStringOption(option => option
							.setName('image')
							.setDescription('link to an image URL'))) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					if (interaction.channel == undefined) throw 'undefined channel';

					await interaction.deferReply({ ephemeral: true });

					if (interaction.options.getSubcommand() == 'create')
					{
						const name = interaction.options.getString('name') as string;
						const type = interaction.options.getString('type') as string;
						const image = interaction.options.getString('image');
						const color = this.colors[type];
						const guild = interaction.guild;

						const Model = DatabaseModel(collectionName, TopicSchema, guild);

						// Create new Role
						const role = await interaction.guild?.roles.create({
							name: name,
							color: color,
						}) as Role;

						// Create embed
						const embed = new MessageEmbed({
							title: `${name} ${type == 'game' ? '🎮 Game' : '🧵 Thread'}`,
							color: color,
							footer: { text: 'Clique sur ✅ pour t\'abonner à ce fil' },
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

						// acknowledge interaction
						switch (interaction.locale)
						{
						case 'fr':
							interaction.editReply({ content: 'Voila!' });
							break;
						default:
							interaction.editReply({ content: 'Done!' });
							break;
						}
					}
					else
					{
						throw 'interaction Error';
					}
				},
		},
	];

	private messages: Message[] = [];

	private colors : { [key: string]: number } = {
		game: 0xad5713,
		thread: 0xa84300,
	};

	public Init(client: Client<boolean>): void
	{
		// Need to fetch all messages in order to receive reaction events
		client.guilds.cache.forEach(async guild =>
		{
			const Model = DatabaseModel(collectionName, TopicSchema, guild);
			const topicMessages = await Model.find({});

			topicMessages.forEach(async msg =>
			{
				this.messages.push(await ((await guild.channels.fetch(msg.channelId)) as TextChannel)?.messages.fetch(msg.messageId));
			});
		});

		client.on('messageReactionAdd', async (reaction, user) =>
		{
			CatchAndLog(async () =>
			{
				if (reaction.message.author?.id as string != client.user?.id as string) return;

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
				if (reaction.message.author?.id as string != client.user?.id as string) return;

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