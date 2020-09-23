var Discord = require('discord.js');

exports.commands = [
	'say',
	'plug',
	'rules',
	'17',
	'typical'
];

exports.say = {
	usage: '<text to say>',
	description: 'make the bot say something',
	process: function (bot, msg, suffix) {
		msg.channel.send(suffix);
		return msg.delete();
	}
}

exports.plug = {
	usage: '',
	description: 'send a link of the plug.dj room',
	process: function (bot, msg, suffix) {
		var embed = new Discord.RichEmbed();
		embed.setAuthor('Plug.dj');
		embed.setColor('#30c8fc');
		embed.setDescription('salon plug.dj officiel de phoenix legacy\n https://plug.dj/phoenixteammusic');
		embed.setThumbnail('http://i.imgur.com/AmccAtN.png');
		embed.setFooter(msg.author.username, msg.author.avatarURL);
		embed.setURL('https://plug.dj/phoenixteammusic');
		msg.channel.send(embed);
	}
}

exports.rules = {
	usage: '',
	description: 'send a link of the server rules',
	process: function (bot, msg, suffix) {
		var embed = new Discord.RichEmbed();
		embed.setAuthor('Charte');
		embed.setColor('#fc8172');
		embed.setDescription('lien de la charte\n https://www.dropbox.com/s/nrqej42m1fp69gc/Be_Good_Have_Fun.pdf?raw=1');
		embed.setFooter(msg.author.username, msg.author.avatarURL);
		embed.setURL('https://www.dropbox.com/s/nrqej42m1fp69gc/Be_Good_Have_Fun.pdf?raw=1');
		msg.channel.send(embed);
	}
}

exports['17'] = {
	usage: '<title> -- <color> -- <message>',
	description: 'send a formatted message\n' +
				 'color codes are the same as minecraft',
	process: function (bot, msg, suffix) {

		//if the message is not sent in the correct channel
		if (msg.channel.name != 'news')
		{
			var m = msg.reply('!17 command is only working in #news').then(message => message.delete(5000));
			return msg.delete();
		}

		var args = suffix.split('--');
		if (args.length !== 3)
			return msg.reply('pas assez d\'arguments pour un appel.');

		var embed = new Discord.MessageEmbed();
		embed.setAuthor(args[0]);
		var color;
		switch (args[1].trim().toLowerCase()) {
			case '0': color = '#000001'; break;
			case '1': color = '#190fff'; break;
			case '2': color = '#179c0f'; break;
			case '3': color = '#059e84'; break;
			case '4': color = '#cb0000'; break;
			case '5': color = '#ab0073'; break;
			case '6': color = '#ffae00'; break;
			case '7': color = '#9c9c9c'; break;
			case '8': color = '#4c4c4c'; break;
			case '9': color = '#4367ff'; break;
			case 'a': color = '#43ff3d'; break;
			case 'b': color = '#00f4ff'; break;
			case 'c': color = '#ff6162'; break;
			case 'd': color = '#ff68d1'; break;
			case 'e': color = '#fff959'; break;
			default: color = '#ffffff'; break;
		}
		embed.setColor(color);
		embed.setDescription(args[2]);
		embed.setFooter(msg.author.username, msg.author.avatarURL);
		msg.reply(embed);
		return msg.delete();
	}
}

exports.typical = {
	usage: '<text to say>',
	description: 'pensee typique, mais bon...',
	process: function (bot, msg, suffix) {
		msg.channel.send("pensée typique de croire que " + suffix + " mais bon, passons.");
		return msg.delete();
	}
}