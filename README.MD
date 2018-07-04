Phoenix Bot
-------------

## Installation

in order to log in, the bot uses the env vars:

>FF_ID as the client ID.
>FF_TOKEN as the auth token.

*for debug purposes*, you can create a envloader.js file to load your keys as env vars.
Everytime the bot starts, it will try to execute the Load() function of the 'envloader.js' file.
so you can do something like:

    exports.Load = () => {
        process.env.FF_TOKEN = 'AUTH_TOKEN';
        process.env.FF_ID = 'CLIENT_ID';
    }

install all the required modules with a 

>npm install

then you're good to go, the entry point is phoenixbot.js

you'll be able to find the link to invite the bot on your server in the logs of the bot.
    