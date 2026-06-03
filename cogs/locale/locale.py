import discord
from discord import option
from discord.ext import commands

from src import FriendlyFire, BaseCog


class Locale(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'locale')

    localeGroup = discord.SlashCommandGroup(
        name="locale",
        description="Manage server language settings",
        default_member_permissions=discord.Permissions(administrator=True),
        contexts=[discord.InteractionContextType.guild],
    )

    async def _get_available_locales(self, ctx: discord.AutocompleteContext):
        return self.bot.available_locales

    @localeGroup.command(name="set", description="Set the language for this server")
    @option(name="language", description="Language code (e.g. en, fr)", required=True, autocomplete=_get_available_locales)
    async def locale_set(self, ctx: discord.ApplicationContext, language: str):
        await ctx.defer(ephemeral=True)
        available = self.bot.available_locales
        if language not in available:
            available_str = ', '.join(f'`{l}`' for l in available)
            await ctx.respond(self.bot.t('locale.unknown_lang', ctx.guild_id, language=language, available=available_str))
            return
        self.bot.locale_config.set('language', language, guild_id=ctx.guild_id)
        self.log(f"Language set to '{language}' by user {ctx.author.name}", ctx.guild)
        await ctx.respond(self.bot.t('locale.set_success', ctx.guild_id, language=language))

    @localeGroup.command(name="get", description="Show the current language for this server")
    async def locale_get(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)
        lang = self.bot.locale_config.get('language', ctx.guild_id) or 'en'
        self.log(f"Language query by user {ctx.author.name}: '{lang}'", ctx.guild)
        await ctx.respond(self.bot.t('locale.current_lang', ctx.guild_id, lang=lang))


def setup(bot):
    bot.add_cog(Locale(bot))
