const fs = require('fs');
const moment = require('moment');

const GENERATED_PATH = './config/generated.json'
const INVITES_PATH = './config/invites.json'
//const GREETINGS_PATH = './config/greetings.json'

var greetings = [
	"Fait pas trop de betises ;)",
	"Pas touche a minouche !",
	"(Les autres, bizutez-le!)",
	"Premiere conso offerte par elie",
	"Les toilettes sont au fond à droite !",
	"Faites comme chez vous ! (enfin dans la limite du raisonable)",
	"Noté #3eme endroit le plus \"pas mal\" par le guide des explorateurs",
	"Faites pas attention au gros là bas",
	"*ferme son livre* Je vous avais pas vu entrer...",
	"Hé ! Tout le monde ! Voila de la viande fraiche.",
	"Bienvenue a PhoenixLegacy Town, Population : Un de plus qu'avant",
	"Bonjour ! Hello ! Guten Tag ! Inserez le langage de votre choix",
	"Le meilleur zelda c'est Ocarina Of Time, comme ça vous saurez !",
	"Random Fact 74 : Le briquet a été inventé avant les allumettes",
	"Du sucre, Des épices et des Tas de bonnes choses. C'est le genre de trucs qu'on trouve dans le coin",
	"La tenue correcte n'exige pas de pantalon",
	"Un nouveau starbucks en 2023",
	"Vous seul êtes responsable de votre interaction avec les autres utilisateurs du Service et les autres parties que vous contactez via le Service. La Compagnie réfute par la présente toute responsabilité envers vous ou toute tierce partie concernant votre utilisation du Service. La Compagnie se réserve le droit mais n'a aucune obligation de gérer les conflits entre vous et d'autres utilisateurs du Service.",
	"Votez Coda",
	"Vous connaissez ma femme ?",
	"Est-ce que c'est trop vous demander, de retirer vos putains de chaussures ?"
]

//var greetings = [];
//try {
//	var a = require(GREETINGS_PATH);
//	greetings = a['greetings'];
//} catch (e) {
//	console.error('generating ' + GREETINGS_PATH);
//	fs.writeFile(GREETINGS_PATH, JSON.stringify({ 'greetings': [ 'welcome home!' ] }, null, 4));
//}

var welcomeMessage =
	'**BIENVENUE SUR PHOENIX !!**\n' +
	'Bienvenue a toi sur le discord de Phoenix Legacy.\n' +
	'ici, on essaie au maximum de ne pas ressembler aux *X* autres serveurs discord que l\'on peut trouver.\n' +
	'c\'est pourquoi on tiens a connaitre tout le monde, alors n\'hesite pas a venir discuter avec des plus "haut gradés" :D\n' +
	/*
	'la hierarchie ici est la suivante:\n```' +
	'Admin      les gentils admins du serveur (Demo le leader de la team et CODA mon createur)\n' +
	'Habitués   les plus vieux membres du serveur\n' +
	'Membres    Les membres valides du serveur\n' +
	'Invités    Toi, qui viens de nous rejoindre\n```' +
	*/
	'Le grade invité que tu as actuellement te permets de rester temporairement et d\'avoir acces a tout le necessaire pour passer de bons moments\n' +
	'si tu souhaite plus t\'impliquer dans l\'equipe et devenir membre, je t\'invite a te presenter sur le channel presentation!\n' +
	'moi je te dis a plus dans le bus (I2C) et bon jeu !\n\n' +
	'**En etant present sur ce serveur, vous vous engagez a respecter les "conditions d\'utilisation"\n' +
	'vous pouvez y acceder via la commande !rules sur le discord**'

var _gen = {};
try {
	_gen = require(GENERATED_PATH);
} catch (e) {
	console.error('generating ' + GENERATED_PATH);
	fs.writeFile(GENERATED_PATH, JSON.stringify(_gen, null, 4));
}

var _inv = {};
try {
	_inv = require(INVITES_PATH);
} catch (e) {
	console.error('generating ' + INVITES_PATH);
	fs.writeFile(INVITES_PATH, JSON.stringify(_inv, null, 4));
}

function getRandomGreeting() {
	return greetings[Math.floor(Math.random() * greetings.length)];
}

exports.commands = [
	'invite',
	'testjoin'
];

exports.events = [
	'guildMemberAdd',
];

exports.invite = {
	usage: '',
	description: 'Request an invite for someone',
	process: function (bot, msg, suffix) {

		var obj = JSON.parse(fs.readFileSync(INVITES_PATH, 'utf8'));

		var maxtokens;
		var tokens;
		var lastfill;

		if (msg.member.roles.find('name', 'Membres')) maxtokens = 2;
		if (msg.member.roles.find('name', 'Habitués')) maxtokens = 5;
		if (msg.member.roles.find('name', 'Original')) maxtokens = 10;
		if (msg.member.roles.find('name', 'Admin')) maxtokens = 9999;

		if (obj[msg.author.id] === undefined) {
			console.log('user not found: ' + msg.author.username);
			obj[msg.author.id] = {
				'name': msg.author.username,
				'tokens': maxtokens,
				'maxtokens': null,
				'lastfill': moment.utc(msg.createdAt).format('DD/MM/YY')
			}
		}

		obj[msg.author.id].name = msg.author.username;
		obj[msg.author.id].maxtokens = maxtokens;

		//check to refill
		if (moment(obj[msg.author.id].lastfill, 'DD/MM/YY').add(1, 'months') < moment.utc(msg.createdAt)) {
			console.log('refilled');
			obj[msg.author.id].tokens = maxtokens;
			obj[msg.author.id].lastfill = moment.utc(msg.createdAt).format('DD/MM/YY');
		}

		//use
		if (obj[msg.author.id].tokens > 0) {
			msg.channel.createInvite({ maxAge: 1800, maxUses: 1, unique: true }).then(function (invite) {
				obj[msg.author.id].tokens--;
				invite.inviter = msg.author;

				msg.reply('I just sent you an invite in private\n' +
					'remaining: ' + obj[msg.author.id].tokens + '/' + obj[msg.author.id].maxtokens + '\n' +
					'next refill the ' + moment(obj[msg.author.id].lastfill, 'DD/MM/YY').add(1, 'months').format('DD/MM/YY'));

				msg.author.send('here is your link: ' + invite + '\n' +
					'it will expire in around ' + invite.maxAge / 60 + ' minutes');

				fs.writeFile(INVITES_PATH, JSON.stringify(obj, null, 2));

				var generated = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
				generated[invite.code] = {
					'userId': msg.author.id,
					'userName': msg.author.username,
					'expiresTimestamp': invite.expiresTimestamp
				};
				fs.writeFile(GENERATED_PATH, JSON.stringify(generated, null, 2));

			});
		}
		else {
			msg.reply('you have no invites left, wait for the ' + moment(obj[msg.author.id].lastfill, 'DD/MM/YY').add(1, 'months').format('DD/MM/YY') + ' for ' + maxtokens + ' more invites.');
		}
	}
}

exports.testjoin = {
	usage: '',
	description: 'test join event',
	process: function (bot, msg, suffix) {
		exports.guildMemberAdd.process(msg.author);
	}
}

exports.guildMemberAdd = {
	process: function (user) {
		var generated = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
		var guild = user.client.guilds.values().next().value;

		//add role
		guild.members.find('id', user.id).addRole(guild.roles.find('name', 'Invités'));

		//welcome message
		guild.fetchInvites().then((invites) => {
			var missing = {};
			var count = 0;

			for (var gen in generated) {
				//purge expired invites
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

			guild.channels.find("name", "general").send(
				'Bienvenue ' + user + inviter + ', sur le discord de Phoenix Legacy.\n' + getRandomGreeting()
			);
		});

		//dm message
		user.send(welcomeMessage);
	}
}