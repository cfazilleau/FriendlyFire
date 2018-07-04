const fs = require('fs');

const permissionsPath = './config/permissions.json';

var permissionsDetails = {};
try {
	permissionsDetails = require(permissionsPath);
} catch (e) {
	console.error('can\'t find a valid permissions file file, generating a new one as ' + permissionsPath);
	permissionsDetails.global = {};
	permissionsDetails.roles = {};
	permissionsDetails.users = {};
	fs.writeFile(permissionsPath, JSON.stringify(permissionsDetailsr, null, 4));
}

//TODO CLEAN
permissionsDetails.hasPermission = function (user, permission) {
	var allowed = false;

	//global
	if (permissionsDetails.global.hasOwnProperty(permission)) {
		allowed = permissionsDetails.global[permission] === true;
	}

	//roles
	var roles = bot.guilds.values().next().value.roles
	roles.forEach( (role) => {
		if (role.members.find('id', user.id)) {
			if (permissionsDetails.roles.hasOwnProperty(role.name) &&
				permissionsDetails.roles[role.name].hasOwnProperty(permission)) {
				allowed = permissionsDetails.roles[role.name][permission] === true;
			}
		}
	});

	//users
	if (permissionsDetails.users.hasOwnProperty(user.id) &&
		permissionsDetails.users[user.id].hasOwnProperty(permission)) {
		allowed = permissionsDetails.users[user.id][permission] === true;
	}
	return allowed;
}

exports.Load = function (bot) {
	console.log("load permMgr");
}