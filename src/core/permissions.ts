import * as discord from "discord.js"
import { readFileSync, writeFileSync } from "fs";
import * as configuration from "./configuration"

export class PermsDetails {
	roles : { [name: string]: { [name: string]: boolean } } = { 'everyone': { 'help': true } };
	users : { [name: string]: { [name: string]: boolean } } = {};

	public hasPermission(user: discord.User, guild: discord.Guild, permission: string) : boolean {
		var allowed : boolean = false;

		if (configuration.configuration.overridePermissions == true)
			return true;

		// for each role
		guild.roles.cache.forEach(role => {
			// if the user has this role
			if (role.members.find(u => u.id == user.id)) {
				// if the role is in the list
				if (this.roles.hasOwnProperty(role.name) &&
				// and if the role has the permission
				this.roles[role.name].hasOwnProperty(permission)) {
					// override 'allowed'
					allowed = this.roles[role.name][permission] === true;
				}
			}
		});

		// if the user is in the users list
		if (this.users.hasOwnProperty(user.id) &&
		// and this permission has an override
		this.users[user.id].hasOwnProperty(permission)) {
			// override 'allowed'
			allowed = this.users[user.id][permission] === true;
		}

		return allowed;
	};
}

const PERMISSIONSDETAILS_PATH = './config/permissions.json';

export var permissionsDetails: PermsDetails = new PermsDetails();
try {
	Object.assign(permissionsDetails, JSON.parse(readFileSync(PERMISSIONSDETAILS_PATH, "utf8")));
} catch (e) {
	console.error('can\'t find a valid permissions file file, generating a new one as ' + PERMISSIONSDETAILS_PATH);
	permissionsDetails.roles = {};
	permissionsDetails.users = {};
}
writeFileSync(PERMISSIONSDETAILS_PATH, JSON.stringify(permissionsDetails, null, 4));
