import discord
from discord.ext import commands
from .config import Config

# ANSI color codes
_RESET  = "\033[0m"
_BOLD   = "\033[1m"
_CYAN   = "\033[36m"
_YELLOW = "\033[33m"
_DIM    = "\033[2m"


class BaseCog(commands.Cog):
    def __init__(self, bot: commands.Bot, config_name: str = None, default_config: dict = None):
        self.bot = bot
        if config_name is not None:
            self.config = Config(config_name, default_config or {})

    def log(self, message: str, guild=None):
        guild_name = "Global"
        if guild is not None:
            if isinstance(guild, discord.Guild):
                guild_name = guild.name
            elif isinstance(guild, int) or (isinstance(guild, str) and guild.isdigit()):
                g = self.bot.get_guild(int(guild))
                if g:
                    guild_name = g.name
                else:
                    guild_name = f"Guild {guild}"
            elif isinstance(guild, str):
                guild_name = guild

        cog_name = type(self).__name__
        guild_tag = f"{_BOLD}{_CYAN}[{guild_name}]{_RESET}"
        cog_tag   = f"{_BOLD}{_YELLOW}[{cog_name}]{_RESET}"
        print(f"{guild_tag} {cog_tag} {message}")

    @commands.Cog.listener()
    async def on_ready(self):
        self.log('Module ready')
