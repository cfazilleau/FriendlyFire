import { writeFileSync } from 'node:fs';
import { Client, Collection, User } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
import { CommandCallback, Plugin, RegisterPlugin } from '../pluginloader';

class InvitesPlugin extends Plugin
{
	public name = 'Invites';

	// Validity of the invite in minutes
	private inviteMaxAge = 15;
	private invitesPath = './config/invites.json';

	private invites = new Collection<string, Map<string, string>>();

	private basicRoleId = '207997903879405568';
	private greetings: string[] = [
		'Fait pas trop de betises ;)',
		'Pas touche a minouche !',
		'(Les autres, bizutez-le!)',
		'Premiere conso offerte par elie',
		'Les toilettes sont au fond à droite !',
		'Faites comme chez vous ! (enfin dans la limite du raisonable)',
		'Noté #3eme endroit le plus "pas mal" par le guide des explorateurs',
		'Faites pas attention au gros là bas',
		'*ferme son livre* Je vous avais pas vu entrer...',
		'Hé ! Tout le monde ! Voila de la viande fraiche.',
		'Bienvenue a PhoenixLegacy Town, Population : Un de plus qu\'avant',
		'Bonjour ! Hello ! Guten Tag ! Inserez le langage de votre choix',
		'Le meilleur zelda c\'est Ocarina Of Time, comme ça vous saurez !',
		'Random Fact 74 : Le briquet a été inventé avant les allumettes',
		'Du sucre, Des épices et des Tas de bonnes choses. C\'est le genre de trucs qu\'on trouve dans le coin',
		'La tenue correcte n\'exige pas de pantalon',
		'Un nouveau starbucks en 2023',
		'Vous seul êtes responsable de votre interaction avec les autres utilisateurs du Service et les autres parties que vous contactez via le Service. La Compagnie réfute par la présente toute responsabilité envers vous ou toute tierce partie concernant votre utilisation du Service. La Compagnie se réserve le droit mais n\'a aucune obligation de gérer les conflits entre vous et d\'autres utilisateurs du Service.',
		'Votez Coda',
		'Vous connaissez ma femme ?',
		'Est-ce que c\'est trop vous demander, de retirer vos putains de chaussures ?',
	];
	private welcomeMessage = `
		**BIENVENUE SUR PHOENIX !!**
		Bienvenue a toi sur le discord de Phoenix Legacy.
		ici, on essaie au maximum de ne pas ressembler aux *X* autres serveurs discord que l'on peut trouver.
		c'est pourquoi on tiens a connaitre tout le monde, alors n'hesite pas a venir discuter avec des plus "haut gradés" :D
		Le grade invité que tu as actuellement te permets de rester temporairement et d'avoir acces a tout le necessaire pour passer de bons moments
		si tu souhaite plus t'impliquer dans l'equipe et devenir membre, je t'invite a te presenter sur le channel presentation!
		moi je te dis a plus dans le bus (I2C) et bon jeu !

		**En etant present sur ce serveur, vous vous engagez a respecter les "conditions d'utilisation"
		vous pouvez y acceder via la commande !rules sur le discord**
		`;

	public commands: { builder: RESTPostAPIApplicationCommandsJSONBody, callback: CommandCallback }[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('invite')
					.setDescription('Generates an invite valid for 15 minutes.')
					.setDescriptionLocalization('fr', `Génère une invitation valide pour une durée de ${this.inviteMaxAge} minutes.`)
					.toJSON(),
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
					.toJSON(),
			callback:
				async (interaction) =>
				{
					console.log();
				},
		},
	];

	private GetRandomGreeting()
	{
		return this.greetings[Math.floor(Math.random() * this.greetings.length)];
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
			console.error(`generating ${this.invitesPath}`);
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