var request = require('request');

exports.commands = [
	'hook'
];

exports.hook = {
	usage: `<URL> <username> <avatar> <message>`,
	description: 'send a message as a webhook',
	process: function (bot, msg, suffix) {
		var args = suffix.split(' ');
		var lengthtoremove = args[0].length + args[1].length + args[2] + 3;
		var JSONObject = {
			'username': args[1],
			'avatar_url': args[2],
			'content': suffix.substr(lengthtoremove)
		};
		request({
			url: args[0],
			method: 'POST',
			json: true,
			body: JSONObject
		});
	}
}