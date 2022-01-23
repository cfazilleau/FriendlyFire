import * as dotenv from "dotenv";
import { FriendlyFire } from "./friendlyfire";

dotenv.config({ path: '.env' });

process.on('unhandledRejejection', (reason) => {
	console.error(reason);
	process.exit(1);
});

export const bot: FriendlyFire = new FriendlyFire();
bot.login();