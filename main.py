from src.bot import FriendlyFire
import os

# load env variables
TOKEN = os.environ['TOKEN']

# create bot
bot = FriendlyFire()

# load all cogs as extensions
for cog in os.listdir('./cogs'):
    bot.load_extension(f'cogs.{cog}.{cog}')

# start the bot
bot.run(TOKEN)