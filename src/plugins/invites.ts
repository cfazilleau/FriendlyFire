import { Client, CommandInteraction, Guild, GuildMember, MessageEmbed, TextChannel, User } from 'discord.js';
import { SlashCommandBuilder, time, userMention } from '@discordjs/builders';

import { Log, Plugin, PluginCommand, DatabaseModel, CatchAndLog } from '../plugin';
import { Schema } from 'mongoose';

const welcomeMessageKey = 'welcomeMessage';
const inviteChannelKey = 'invitesChannel';
const inviteMaxAgeKey = 'inviteMaxAge';
const baseRoleKey = 'baseRoleId';

const defaultWelcomeMessage = 'Welcome to the server';

interface IInvite
{
	author: string,
	code: string,
	expiration: number,
}

interface IGreeting
{
	greeting: string,
}

const InviteSchema = new Schema<IInvite>({
	author: { type: String, required: true },
	code: { type: String, required: true },
	expiration: { type: Number, required: true },
});

const GreetingSchema = new Schema<IGreeting>({
	greeting: { type: String, required: true },
});

class InvitesPlugin extends Plugin
{
	public name = 'Invites';

	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('invite')
					.setDescription('Generates a temporary invite.')
					.setDescriptionLocalization('fr', 'Génère une invitation temporaire.')
					.setDefaultPermission(false),
			callback:
				async (interaction: CommandInteraction) =>
				{
					const author = interaction.member?.user as User;
					const inviteMaxAge = this.GetProperty(inviteMaxAgeKey, 15, interaction.guild as Guild);

					if (author != undefined && interaction.guild != undefined)
					{
						const invite = await interaction.guild.invites.create(interaction.channelId, { temporary: true, maxAge: inviteMaxAge * 60, maxUses: 1, unique: true });
						const Invite = await DatabaseModel('invites', InviteSchema, interaction.guild);

						const inviteData = new Invite({
							author: author.id,
							code: invite.code,
							expiration: invite.expiresTimestamp,
						});
						inviteData.save();


						switch (interaction.locale)
						{
						case 'fr':
							await interaction.reply({
								content: `Voila ton lien: ${invite}\nIl sera valide jusqu'au ${time(new Date(invite.expiresTimestamp as number))}`,
								ephemeral: true,
							});
							break;
						default:
							await interaction.reply({
								content: `Here is your link: ${invite}\nIt will be valid until the ${time(new Date(invite.expiresTimestamp as number))}`,
								ephemeral: true,
							});
							break;
						}
					}
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('testjoin')
					.setDescription('Triggers user joined event for the "Invite" plugin')
					.setDescriptionLocalization('fr', 'Simule l\'evenement d\'arrivée d\'un nouvel utilisateur pour le plugin "Invite"')
					.setDefaultPermission(false)
					.addUserOption(user => user
						.setName('user')
						.setDescription('User to join')
						.setDescriptionLocalization('fr', 'Utilisateur a faire rejoindre')
						.setRequired(false)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					let member : GuildMember = interaction.member as GuildMember;

					const user = interaction.options.getUser('user');
					if (user != undefined)
					{
						const members = await interaction.guild?.members.fetch();
						if (members != undefined)
						{
							member = await members.get(user.id) as GuildMember;
						}
					}

					this.OnGuildMemberAdded(member);

					switch (interaction.locale)
					{
					case 'fr':
						interaction.reply({ content: 'Voila!', ephemeral: true });
						break;
					default:
						interaction.reply({ content: 'Done!', ephemeral: true });
						break;
					}
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('addgreeting')
					.setDescription('Adds a greeting to the database')
					.setDescriptionLocalization('fr', 'Ajoute un message de bienvenue a la base de données')
					.setDefaultPermission(false)
					.addStringOption(option => option
						.setName('greeting')
						.setDescription('greeting message to add')
						.setDescriptionLocalization('fr', 'message de bienvenue a ajouter')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					const greetingOption = interaction.options.getString('greeting');

					const Greeting = await DatabaseModel('greetings', GreetingSchema, interaction.guild);
					const greetingEntry = new Greeting({
						greeting: greetingOption,
					});

					await greetingEntry.save();

					switch (interaction.locale)
					{
					case 'fr':
						interaction.reply({ content: 'Message de bienvenue ajouté!', ephemeral: true });
						break;
					default:
						interaction.reply({ content: 'Greeting message saved!', ephemeral: true });
						break;
					}
				},
		},
	];

	private async GetRandomGreeting(guild: Guild)
	{
		const Greeting = await DatabaseModel('greetings', GreetingSchema, guild);
		return (await Greeting.aggregate([{ $sample: { size: 1 } }])).at(0)?.greeting ?? '';
	}

	private async OnGuildMemberAdded(member: GuildMember)
	{
		const guild = member.guild;
		const user = await member.user.fetch(true);

		Log(`New guild member: ${member.displayName}`);

		// Add role
		const roleId = this.GetProperty(baseRoleKey, undefined, guild);
		if (roleId != undefined)
		{
			const role = await guild.roles.fetch(roleId);
			if (role != undefined)
			{
				member.roles.add(role);
			}
		}

		// Check invite used
		const Invite = await DatabaseModel('invites', InviteSchema, guild);

		// To compare, we need to load the current invite list.
		const invites = await guild.invites.fetch();
		const recordedInvites = await Invite.find({});

		Log(`${invites.size} invites server-side, ${recordedInvites.length} bot-side.`);

		let inviterMention = '';
		for (let i = 0; i < recordedInvites.length; i++)
		{
			const inv = recordedInvites[i];

			if (!invites.has(inv.code))
			{
				const inviter = await guild.members.fetch(inv.author);

				Log(`${member.displayName} joined using invite code ${inv.code} from ${inviter.displayName}.`);
				inviterMention = userMention(inv.author);
				inv.delete();
			}
		}

		if (inviterMention == '')
		{
			Log(`${member.displayName} joined using unknown invite code.`);
		}

		const embed = new MessageEmbed({
			title: 'Bienvenue!',
			thumbnail: { url: user.avatarURL({ size: 1024 }) as string },
			description: `Bienvenue a ${userMention(member.id)}, ${inviterMention != '' ? `invité.e par ${inviterMention}, ` : ''}sur le discord de [Phoenix Legacy](http://phxlgc.com)!\n${await this.GetRandomGreeting(guild)}`,
			color: user.accentColor as number,
		});

		const mainChannelId = this.GetProperty(inviteChannelKey, undefined, guild);
		const mainChannel = (mainChannelId ? await guild.channels.fetch(mainChannelId) : guild.systemChannel) as TextChannel;
		mainChannel.send({ embeds: [ embed ] });
		user.send(this.GetProperty<string>(welcomeMessageKey, defaultWelcomeMessage, guild));
	}

	private async ClearExpiredInvites(client: Client<boolean>)
	{
		await client.guilds.fetch();
		client.guilds.cache.forEach(async guild =>
		{
			const Invite = await DatabaseModel('invites', InviteSchema, guild);

			const recordedInvites = await Invite.find({});
			recordedInvites.forEach(invite =>
			{
				if (invite.expiration - Date.now() < 0)
				{
					Log(`Deleting expired invite: ${invite.code}`);
					invite.delete();
				}
			});
		});
	}

	public Init(client: Client<boolean>): void
	{
		client.on('guildMemberAdd', async (member) =>
		{
			if (member.guild != null && !this.IsPluginEnabledOnGuild(member.guild))
			{
				return;
			}

			CatchAndLog(async () =>
			{
				await this.OnGuildMemberAdded(member);
			});
		});

		CatchAndLog(async () =>
		{
			await this.ClearExpiredInvites(client);
		});
	}
}

(new InvitesPlugin()).Register();