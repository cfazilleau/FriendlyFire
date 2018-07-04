const configMgr		= require('./configManager.js');
const bot			= require('./bot.js');

try {
	require('./envloader.js').Load();
} 
catch {
	console.log('envloader not found, using global env vars.');
}

process.on('unhandledRejejection', (reason) => {
	console.error(reason);
	process.exit(1);
});

configMgr.Init();

bot.Start();