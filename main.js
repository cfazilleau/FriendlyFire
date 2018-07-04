const configMgr		= require('./configManager.js');
const bot			= require('./bot.js');

process.on('unhandledRejejection', (reason) => {
	console.error(reason);
	process.exit(1);
});

configMgr.Init();

bot.Start();