var Discord = require('discord.js');

exports.commands = [
	'delete'
];

exports.delete = {
	usage: '<number of messages>',
	description: 'delete the last # messages of this channel',
	process: function(bot, message, suffix) {
		var number = parseInt(suffix);
		console.log('deleting ' + number + ' messages');
		if (isNaN(number)) {
			console.log('error deleting messages');
			message.reply('error, number seen as ' + number);
		}
		else {
			message.channel.fetchMessages({limit: number + 1}).then(function (messages) {
				message.channel.bulkDelete(messages);
				message.reply('done').then((message => message.delete(5000)));
			});
		}
	}
}