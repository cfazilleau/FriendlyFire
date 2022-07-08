import { Client, Guild, MessageEmbed, TextChannel, User } from 'discord.js';
import { SlashCommandBuilder, userMention } from '@discordjs/builders';

import { Log, Plugin, PluginCommand, DatabaseModel, CatchAndLog } from '../plugin';
import { Schema } from 'mongoose';

const welcomeMessageKey = 'welcomeMessage';
const greetingsKey = 'greetings';
const inviteChannelKey = 'invitesChannel';

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

	// Validity of the invite in minutes
	private inviteMaxAge = 15;
	private invitesPath = './config/invites.json';

	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('invite')
					.setDescription('Generates an invite valid for 15 minutes.')
					.setDescriptionLocalization('fr', `Génère une invitation valide pour une durée de ${this.inviteMaxAge} minutes.`)
					.setDefaultPermission(false),
			callback:
				async (interaction) =>
				{
					const author = interaction.member?.user as User;

					if (author != undefined && interaction.guild != undefined)
					{
						const invite = await interaction.guild.invites.create(interaction.channelId, { maxAge: this.inviteMaxAge * 60, maxUses: 1, unique: true });
						const Invite = DatabaseModel('invites', InviteSchema, interaction.guild);

						const inviteData = new Invite({
							author: author.id,
							code: invite.code,
							expiration: invite.expiresTimestamp,
						});
						inviteData.save();

						await interaction.reply({
							content: `here is your link: ${invite}\nIt will be valid for the next ${this.inviteMaxAge} minutes`,
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
					.setDefaultPermission(false),
			callback:
				async (interaction) =>
				{
					const welcomeMessage : string = this.GetProperty<string>(welcomeMessageKey, defaultWelcomeMessage, interaction.guild as Guild);
					interaction.reply(welcomeMessage);
				},
		},
	];

	private GetRandomGreeting(guild: Guild)
	{
		const greetings: string[] = this.GetProperty<string[]>(greetingsKey, defaultGreetings, guild);
		return greetings[Math.floor(Math.random() * greetings.length)];
	}

	/*
	private OnGuildMemberAdded(member : GuildMember, guild : Guild)
	{
				const generated = JSON.parse(readFileSync(this.invitesPath, 'utf8'));

				// add role
				guild.roles.fetch(this.basicRoleId).then(role => {
					if (role) member.roles.add(role);
				})

				// welcome message
				guild.fetchInvites().then((invites) => {
					const missing = {};
					let count = 0;

					// eslint-disable-next-line no-var
					for (var gen in generated) {
						// purge expired invites
						if (generated[gen].expiresTimestamp < moment.now()) {
							generated[gen] == undefined;
							continue;
						}

						//find missing ones
						var found = invites.find((element) => {
							if (element.code == gen)
								return gen;
						});

						if (!found) {
							missing[count++] = generated[gen];
							delete generated[gen];
						}
					}

					//find inviter
					var inviter = '';
					if (Object.keys(missing).length == 1) {
						var invuser = guild.members.find('id', missing[0].userId);
						if (invuser)
							inviter = ', invite par ' + invuser;
					}

					fs.writeFile(GENERATED_PATH, JSON.stringify(generated, null, 2));

					guild.channels.find('name', 'general').send(
						'Bienvenue ' + user + inviter + ', sur le discord de Phoenix Legacy.\n' + getRandomGreeting();
					);
			});

			//dm message
			user.send(welcomeMessage);
	}
	*/

	public Init(client: Client<boolean>): void
	{
		/*
		// Fetch all Guild Invites, set the key as Guild ID, and create a map which has the invite code, and the number of uses
		client.guilds.cache.forEach(async (guild) =>
		{
			// Update database based on the available guild invites

			const firstInvites = await guild.invites.fetch();
			this.invites.set(guild.id, new Map(firstInvites.map(invite => [invite.code, invite.inviterId ?? ''])));
		});

		client.on('inviteDelete', (invite) =>
		{
			const guild = this.invites.get(invite.guild?.id ?? '');
			if (guild)
			{
				// Delete the Invite from Cache
				guild.delete(invite.code);
			}
		});

		client.on('inviteCreate', (invite) =>
		{
			const guildId = invite.guild?.id;
			const authorId = invite.inviterId;

			// Update cache on new invites
			if (guildId && authorId)
			{
				const guild = this.invites.get(guildId) ?? this.invites.set(guildId, new Map()).get(guildId);

				if (guild)
				{
					guild.set(invite.code, authorId);
				}
			}
		});
		//*/

		client.on('guildMemberAdd', async (member) =>
		{
			CatchAndLog(async () =>
			{
				const guild = member.guild;

				Log(`New guild member: ${member.displayName}`);
				const Invite = DatabaseModel('invites', InviteSchema, guild);

				// To compare, we need to load the current invite list.
				const invites = await guild.invites.fetch();
				const recordedInvites = await Invite.find({});

				Log(`${invites.size} invites server-side, ${recordedInvites.length} bot-side.`);

				recordedInvites.forEach(async inv =>
				{
					if (!invites.has(inv.code))
					{
						const inviter = await guild.members.fetch(inv.author);
						const mainChannelId = this.GetProperty(inviteChannelKey, undefined, guild);
						const mainChannel = (mainChannelId ? await guild.channels.fetch(mainChannelId) : guild.systemChannel) as TextChannel;

						Log(`${member.displayName} joined using invite code ${inv.code} from ${inviter.displayName}.`);

						const embed = new MessageEmbed({
							title: 'Bienvenue!',
							thumbnail: { url: member.avatarURL({ format: 'png', size: 1024, dynamic: true }) as string },
							description: `Bienvenue a ${userMention(member.id)}, invité.e par ${userMention(inv.author)}, sur le discord de Phoenix Legacy!\n${this.GetRandomGreeting(guild)}`,
							color: member.user.accentColor as number,
						});

						mainChannel.send({ embeds: [ embed ] });

						inv.delete();
					}
				});

				// Clear expired invites
			});
		});
	}
}

(new InvitesPlugin()).Register();