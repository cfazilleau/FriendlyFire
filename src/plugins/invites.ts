import { Client, Guild, GuildMember, MessageEmbed, TextChannel, User } from 'discord.js';
import { SlashCommandBuilder, userMention } from '@discordjs/builders';

import { Log, Plugin, PluginCommand, DatabaseModel, CatchAndLog } from '../plugin';
import { Schema } from 'mongoose';

const welcomeMessageKey = 'welcomeMessage';
const greetingsKey = 'greetings';
const inviteChannelKey = 'invitesChannel';
const inviteMaxAgeKey = 'inviteMaxAge';
const baseRoleKey = 'baseRoleId';

const defaultGreetings = [ 'Welcome!' ];
const defaultWelcomeMessage = 'Welcome to the server';

interface IInvite
{
	author: string,
	code: string,
	expiration: string,
}

const InviteSchema = new Schema<IInvite>({
	author: { type: String, required: true },
	code: { type: String, required: true },
	expiration: { type: String, required: true },
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
				async (interaction) =>
				{
					const author = interaction.member?.user as User;
					const inviteMaxAge = this.GetProperty(inviteMaxAgeKey, 15, interaction.guild as Guild);

					if (author != undefined && interaction.guild != undefined)
					{
						const invite = await interaction.guild.invites.create(interaction.channelId, { maxAge: inviteMaxAge * 60, maxUses: 1, unique: true });
						const Invite = DatabaseModel('invites', InviteSchema, interaction.guild);

						const inviteData = new Invite({
							author: author.id,
							code: invite.code,
							expiration: invite.expiresTimestamp,
						});
						inviteData.save();

						await interaction.reply({
							content: `here is your link: ${invite}\nIt will be valid for the next ${inviteMaxAge} minutes`,
							ephemeral: true,
						});
					}
				},
		},
		{
			builder:
				new SlashCommandBuilder()
					.setName('testjoin')
					.setDescription('trigger user joined event for the invite plugin')
					.setDefaultPermission(false)
					.addUserOption(user => user
						.setName('user')
						.setDescription('user to join')
						.setRequired(false)) as SlashCommandBuilder,
			callback:
				async (interaction) =>
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
					interaction.reply({ content: 'done.', ephemeral: true });
				},
		},
	];

	private GetRandomGreeting(guild: Guild)
	{
		const greetings: string[] = this.GetProperty<string[]>(greetingsKey, defaultGreetings, guild);
		return greetings[Math.floor(Math.random() * greetings.length)];
	}

	private async OnGuildMemberAdded(member: GuildMember)
	{
		const guild = member.guild;

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
		const Invite = DatabaseModel('invites', InviteSchema, guild);

		// To compare, we need to load the current invite list.
		const invites = await guild.invites.fetch();
		const recordedInvites = await Invite.find({});

		Log(`${invites.size} invites server-side, ${recordedInvites.length} bot-side.`);

		let inviterMention = '';
		recordedInvites.forEach(async inv =>
		{
			if (!invites.has(inv.code))
			{
				const inviter = await guild.members.fetch(inv.author);

				Log(`${member.displayName} joined using invite code ${inv.code} from ${inviter.displayName}.`);
				inviterMention = userMention(inv.author);
				inv.delete();
			}
		});

		const embed = new MessageEmbed({
			title: 'Bienvenue!',
			thumbnail: { url: member.user.avatarURL({ format: 'png', size: 1024, dynamic: true }) as string },
			description: `Bienvenue a ${userMention(member.id)} ${inviterMention != '' ? `, invité.e par ${inviterMention}` : ''}, sur le discord de Phoenix Legacy!\n${this.GetRandomGreeting(guild)}`,
			color: member.user.accentColor as number,
		});

		const mainChannelId = this.GetProperty(inviteChannelKey, undefined, guild);
		const mainChannel = (mainChannelId ? await guild.channels.fetch(mainChannelId) : guild.systemChannel) as TextChannel;
		mainChannel.send({ embeds: [ embed ] });
		member.user.send(this.GetProperty<string>(welcomeMessageKey, defaultWelcomeMessage, guild));
	}

	private ClearExpiredInvites()
	{
		// TODO: Clear old invites
	}

	public Init(client: Client<boolean>): void
	{
		client.on('guildMemberAdd', async (member) =>
		{
			CatchAndLog(async () =>
			{
				await this.OnGuildMemberAdded(member);
			});
		});

		CatchAndLog(async () =>
		{
			await this.ClearExpiredInvites();
		});
	}
}

(new InvitesPlugin()).Register();