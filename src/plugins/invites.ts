import { writeFileSync } from 'node:fs';
import { Client, Collection, Guild, User } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { Plugin, PluginCommand, RegisterPlugin } from '../pluginloader';
import { Log } from '../utils';
import { GetProperty, SetProperty } from '../config';

const welcomeMessageKey = 'welcomeMessage';
const greetingsKey = 'greetings';

const defaultGreetings = [ 'Welcome!' ];
const defaultWelcomeMessage = 'Welcome to the server';

class InvitesPlugin extends Plugin
{
	public name = 'Invites';

	// Validity of the invite in minutes
	private inviteMaxAge = 15;
	private invitesPath = './config/invites.json';

	private invites = new Collection<string, Map<string, string>>();

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

					if (author != undefined)
					{
						const invite = await interaction.guild?.invites.create(interaction.channelId, { maxAge: this.inviteMaxAge * 60, maxUses: 1, unique: true });

						if (invite == undefined) throw 'couldn\'t create invite';

						invite.inviterId = author.id;
						invite.inviter = author;

						await interaction.reply(`here is your link: ${invite}\nIt will be valid for the next ${this.inviteMaxAge} minutes`);

						const guildId = interaction.guild?.id;

						if (guildId && author.id)
						{
							const guild = this.invites.get(guildId) ?? this.invites.set(guildId, new Collection()).get(guildId);

							if (guild)
							{
								guild.set(invite.code, author.id);
							}
						}

						this.SaveGeneratedInvites();
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
					const welcomeMessage : string = GetProperty<string>(this, welcomeMessageKey, defaultWelcomeMessage, interaction.guild as Guild);
					SetProperty<string>(this, welcomeMessageKey, welcomeMessage, interaction.guild as Guild);

					interaction.reply(welcomeMessage);
				},
		},
	];

	private GetRandomGreeting(guild : Guild)
	{
		const greetings : string[] = GetProperty<string[]>(this, greetingsKey, defaultGreetings, guild);
		SetProperty<string[]>(this, greetingsKey, greetings, guild);

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
	private SaveGeneratedInvites()
	{
		writeFileSync(this.invitesPath, JSON.stringify(this.invites, null, 4));
	}

	public Init(client: Client<boolean>): void
	{
		try
		{
			this.invites = require(this.invitesPath);
		}
		catch (e)
		{
			Log(`generating ${this.invitesPath}`);
			this.SaveGeneratedInvites();
		}

		// Fetch all Guild Invites, set the key as Guild ID, and create a map which has the invite code, and the number of uses
		client.guilds.cache.forEach(async (guild) =>
		{
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

		client.on('guildCreate', (guild) =>
		{
			// We've been added to a new Guild. Let's fetch all the invites, and save it to our cache
			guild.invites.fetch().then(guildInvites =>
			{
				// This is the same as the ready event
				this.invites.set(guild.id, new Map(guildInvites.map((invite) => [invite.code, invite.inviterId ?? ''])));
			});
		});

		client.on('guildDelete', (guild) =>
		{
			// We've been removed from a Guild. Let's delete all their invites
			this.invites.delete(guild.id);
		});

		client.on('guildMemberAdd', async (member) =>
		{
			// To compare, we need to load the current invite list.
			const invites = await member.guild.invites.fetch();
			// This is the *existing* invites for the guild.
			const generated = this.invites.get(member.guild.id) ?? this.invites.set(member.guild.id, new Map()).get(member.guild.id);

			if (!invites || !generated) return;

			for (const code in generated)
			{
				const invite = invites.get(code);
				if (!invite?.expiresTimestamp) continue;

				// purge expired invites
				if (invite.expiresTimestamp < new Date().getTime())
				{
					generated.delete(code);
					continue;
				}

				/*
				// find missing ones
				const found = invites.find((element) => element.code == code);
				if (!found)
				{
					missing[count++] = oldInvites[code];
					delete oldInvites[code];
				}
				*/
			}

			/*
			// This is just to simplify the message being sent below (inviter doesn't have a tag property)
			const inviter = await client.users.fetch(invite.inviter.id);
			// Get the log channel (change to your liking)
			const logChannel = member.guild.channels.cache.find(channel => channel.name === 'join-logs');
			// A real basic message with the information we need.
			inviter
				? logChannel.send(`${member.user.tag} joined using invite code ${invite.code} from ${inviter.tag}. Invite was used ${invite.uses} times since its creation.`)
				: logChannel.send(`${member.user.tag} joined but I couldn't find through which invite.`);
			*/
		});
	}
}

RegisterPlugin(new InvitesPlugin());