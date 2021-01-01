const rconclient = require("rcon-client");

const rcon = new rconclient.Rcon({ host: process.env.MC_IP, port: process.env.MC_PORT, password: process.env.MC_PASSWORD })

function SendCommand(command, backlogChannel)
{
	rcon.connect()
	.then(rcon => {
		rcon.send(command)
		.then(e => {
			if (e)
				backlogChannel.send(e);
			else
				backlogChannel.send("sent command `" + command + "`");
		}).catch(e => backlogChannel.send(e.toString()));
		rcon.end();
	}).catch(e => backlogChannel.send(e.toString()));
}

exports.commands = [
	'mc',
	'mcw'
]

exports.mc = {
	usage: '<Command>',
	description: 'Execute Rcon Command',
	process: function (bot, msg, suffix) {
		SendCommand(suffix, msg.channel);
	}
}

exports.mcw = {
	usage: '<List, Add, Remove> [Name]',
	description: 'List the current whitelist, or Add/Remove a player',
	process: function (bot, msg, suffix) {
		var args = suffix.split(" ");

		if (args.length < 1)
			msg.channel.send("unsufficient number of args");

		// Whitelist list
		if (args[0].toLowerCase() === "list")
		{
			SendCommand("whitelist list", msg.channel);
		}
		// Whitelist add
		else if (args[0].toLowerCase() === "add")
		{
			if (args.length != 2)
				msg.channel.send("incorrect number of args. > `mcw add <player>`");
			else
				SendCommand("whitelist add " + args[1], msg.channel);
		}
		// Whitelist remove
		else if (args[0].toLowerCase() === "remove")
		{
			if (args.length != 2)
				msg.channel.send("incorrect number of args. > `mcw remove <player>`");
			else
				SendCommand("whitelist remove " + args[1], msg.channel);
		}
		else
		{
			msg.channel.send("incorrect argument: " + args[0] + " instead of list/add/remove");
		}
	}
}