var Discord = require('discord.js');

exports.commands = [
	'yn',
	'ynu',
	'poll'
];

exports['yn'] = {
	usage: '<question>',
	description: 'send a poll with the 👎 and 👍 reacts',
	process: function(bot, msg, suffix) {
		var embed = new Discord.RichEmbed();
		var text = suffix;
		if (text === '')
		{
			msg.delete();
			return;
		}
		embed.setAuthor('sondage de ' + msg.author.username + ':',msg.author.avatarURL);
		embed.setColor('#FFDB2A');
		embed.setDescription(text);
		msg.channel.sendEmbed(embed).then(function (Message){
			Message.react('👍');
			Message.react('👎');
		});
		msg.delete();
	}
}

exports['ynu'] = {
	usage: '<question>',
	description: 'send a poll with the 👎, 👍 and ✋ reacts',
	process: function(bot, msg, suffix) {
		var embed = new Discord.RichEmbed();
		var text = suffix;
		if (text === '')
		{
			msg.delete();
			return;
		}
		embed.setAuthor('sondage de ' + msg.author.username + ':',msg.author.avatarURL);
		embed.setColor('#FFDB2A');
		embed.setDescription(text);
		msg.channel.sendEmbed(embed).then(function (Message){
			Message.react('👍');
			Message.react('👎');
			Message.react('✋');
		});
		msg.delete();
	}
}

exports['poll'] = {
	usage: '<question> -- <reacts>',
	description: 'send a poll with custom reacts',
	process: function(bot, msg, suffix) {
		var embed = new Discord.RichEmbed();
		var text = suffix.split('--');
		if (text[0] === '' || text[1] === '' || text.length !== 2)
		{
			msg.delete();
			return;
		}
		embed.setAuthor('sondage de ' + msg.author.username + ':',msg.author.avatarURL);
		embed.setColor('#FFDB2A');
		embed.setDescription(text[0]);
		msg.channel.sendEmbed(embed).then(function (message){
			var emote = text[1].split(' ');
			for (var i = 0; i < emote.length; i++){
				if (emote[i] !== '')
				{
					message.react(emote[i]);
				}
			}
		});
		msg.delete();
	}
}