import discord
from discord.ext import commands
from .config import Config

ADMIN_PERMS = discord.Permissions(administrator=True)


class BaseCog(commands.Cog):
    def __init__(self, bot: commands.Bot, config_name: str = None, default_config: dict = None):
        self.bot = bot
        if config_name is not None:
            self.config = Config(config_name, default_config or {})

    def log(self, message: str):
        print(f'[{type(self).__name__}] {message}')

    @commands.Cog.listener()
    async def on_ready(self):
        self.log('Module ready')
