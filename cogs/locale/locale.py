import discord
from discord import option
from discord.ext import commands

from src import FriendlyFire, BaseCog


class Locale(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, None)

    localeGroup = discord.SlashCommandGroup(
        name="locale",
        description="Manage server language settings",
        default_member_permissions=discord.Permissions(administrator=True),
        contexts=[discord.InteractionContextType.guild],
    )

    async def _get_available_locales(self, ctx: discord.AutocompleteContext):
        return self.bot.locale_manager.available_locales()

    @localeGroup.command(name="set", description="Set the language for this server")
    @option(name="language", description="Language code (e.g. en, fr)", required=True, autocomplete=_get_available_locales)
    async def locale_set(self, ctx: discord.ApplicationContext, language: str):
        await ctx.defer(ephemeral=True)
        available = self.bot.locale_manager.available_locales()
        if language not in available:
            await ctx.respond(f"Unknown language `{language}`. Available: {', '.join(f'`{l}`' for l in available)}")
            return
        self.bot.locale_config.set('language', language, guild_id=ctx.guild_id)
        await ctx.respond(f"Server language set to `{language}`.")

    @localeGroup.command(name="get", description="Show the current language for this server")
    async def locale_get(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)
        lang = self.bot.locale_config.get('language', ctx.guild_id) or 'en'
        await ctx.respond(f"Current language: `{lang}`.")


def setup(bot):
    bot.add_cog(Locale(bot))
