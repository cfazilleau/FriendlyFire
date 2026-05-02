from discord.ext import commands
from .config import Config


class BaseCog(commands.Cog):
    def __init__(self, bot: commands.Bot, config_name: str = None, default_config: dict = None):
        self.bot = bot
        if config_name is not None:
            self.config = Config(config_name, default_config or {})

    def log(self, message: str):
        print(f'[{type(self).__name__}] {message}')

    def t(self, key: str, guild_id=None, **kwargs) -> str:
        return self.bot.t(key, guild_id, **kwargs)

    @commands.Cog.listener()
    async def on_ready(self):
        self.log('Module ready')
