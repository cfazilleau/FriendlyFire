from src.bot import FriendlyFire
import os

from dotenv import load_dotenv
# Load variables from .env file
load_dotenv()

# load env variables
TOKEN = os.environ['TOKEN']
MONGO_URI = os.environ['MONGO_URI']

# create bot
bot = FriendlyFire(mongo_uri=MONGO_URI)

# load all cogs as extensions
for cog in os.listdir('./cogs'):
    if os.path.isdir(f'./cogs/{cog}') and not cog.startswith('_'):
        if os.path.exists(f'./cogs/{cog}/{cog}.py'):
            bot.load_extension(f'cogs.{cog}.{cog}')

# start the bot
bot.run(TOKEN)