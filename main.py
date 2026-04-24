from src.bot import FriendlyFire
import os

# load env variables
TOKEN = os.environ['TOKEN']
MONGO_URI = os.environ['MONGO_URI']

# create bot
bot = FriendlyFire(mongo_uri=MONGO_URI)

# load all cogs as extensions
for cog in os.listdir('./cogs'):
    if not os.path.isdir(f'./cogs/{cog}') or cog.startswith('_'):
        continue
    bot.load_extension(f'cogs.{cog}.{cog}')

# start the bot
bot.run(TOKEN)