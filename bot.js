const discord		= require('discord.js');

const permMgr		= require('./permissionsManager.js');
const commandMgr	= require('./commandManager.js');
const eventMgr		= require('./eventManager.js');
// const pluginMgr = require('./pluginManager.js');

const bot = new discord.Client();

exports.Start = function () {
	console.log("start bot");
	// commandMgr.Load();
	// eventMgr.Load();

	bot.on('ready', () => {
		console.log('connected successfully. Serving in ' + bot.guilds.array().length + ' servers');
		// pluginMgr.Init();
	});

	bot.on('disconnect', () => {
		console.log('bot disconnected.');
		process.exit(1);
	});

	bot.on('reconnecting', () => {
		console.log('trying to reconnect...');
	});

	bot.on('resume', (replayedCount) => {
		console.log('reconnected after ' + replayedCount + ' tries.');
	});

	bot.on('warn', (warning) => {
		console.warn(warning);
	});

	bot.on('error', (error) => {
		console.error(error);
	});

	bot.on('message', (message) => {
		commandMgr.Process(message);
		eventMgr.ProcessMessage(message);
	});

	bot.on('messageUpdate', (oldMessage, newMessage) => {
		commandMgr.Process(newMessage);
		eventMgr.ProcessMessage(newMessage);
	});

	bot.on('guildMemberAdd', (member) => {
		eventMgr.ProcessGuildMemberAdd(member);
	});

	bot.on('guildMemberRemove', (member) => {
		eventMgr.ProcessGuildMemberRemove(member);
	});

	bot.on('messageDelete', (message) => {
		eventMgr.ProcessMessageDelete(member);
	});

	console.log('invite link: https://discordapp.com/oauth2/authorize?&client_id=' + process.env.FF_ID + '&scope=bot&permissions=470019135');
	bot.login(process.env.FF_TOKEN)
		.then(
			console.log("login success")
		)
		.catch((error) => {
			console.error('failed to login ' + process.env.FF_TOKEN);
		});

	permMgr.Load(bot);
}