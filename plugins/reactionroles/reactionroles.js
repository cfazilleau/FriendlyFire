const Discord = require('discord.js');

exports.events = [
	'message',
	'messageDelete',
	'messageReactionAdd',
	'messageReactionRemove'
]

exports.commands = [
	'reactionRole'
]

//function WatchMessage(message, )

exports.messageReactionAdd = {
	process: function (bot, reaction, user) {
		// is the message a bot message and is the bot reacting to the message
		if (reaction.message.author.id == bot.user.id && user.id != bot.user.id)
		{
			// is the reaction a valid one
			if (reaction.emoji == '✅' || reaction.emoji == '❌')
			{
				// bool isReactionAdd
				var add = reaction.emoji == '✅';

				// search map for messageid / role
				var role = getRole(reaction.message.id)

				// if found
				if (role)
				{
					if (add)
					{
						// add role
						user.roles.add(role);
					}
					else
					{
						// remove role
						user.roles.remove(role);
					}
				}
			}
		}
	}
}

exports.messageReactionAdd = {
	process: function (reaction, user) {

	}
}

exports.reactionRole = {
	usage: '<@Role> [message]',
	description: 'creates a reaction message for a given role',
	process: function (bot, msg, suffix) {
		if (msg.mentions && msg.mentions.roles && msg.mentions.roles.size > 0)
		{
			var role = msg.mentions.roles.first();

			msg.channel.send('React to this message with ✅ to get the role ' + role + ' or with ❌ to remove it.').then(message => {
				message.react('✅').then(message.react('❌'));
				//watchMessage(message, role);
			}).then(msg.delete());
		}
	}
}