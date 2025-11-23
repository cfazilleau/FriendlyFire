import discord
from discord.ext import commands

class Presence(commands.Cog):
    def __init__(self, bot: discord.Bot):
        self.bot = bot

    @discord.slash_command(name="status", description="update current bot status", default_permission=False)
    @discord.option(name="status", description="status of the bot", required=True, choices=[
        discord.OptionChoice(name="online", value="online"),
        discord.OptionChoice(name="idle", value="idle"),
        discord.OptionChoice(name="do not disturb", value="dnd"),
        discord.OptionChoice(name="invisible", value="invisible")])
    async def status(self, ctx: discord.ApplicationContext, status: str):
        await ctx.defer(ephemeral=True)
        status_enum = discord.enums.Status[status]
        print(f"Setting status to {status}")
        # TODO: maintain current activity
        await self.bot.change_presence(status=status_enum)
        await ctx.respond(f"Bot status set to: {status}")

    activity_group = discord.SlashCommandGroup(name="activity", description="manage current bot activity")

    @activity_group.command(name="set", description="set current bot activity", default_permission=False)
    @discord.option(name="activity", description="activity of the bot", required=True, choices=[
        discord.OptionChoice(name="playing", value="playing"),
        discord.OptionChoice(name="watching", value="watching"),
        discord.OptionChoice(name="listening", value="listening"),
        discord.OptionChoice(name="streaming", value="streaming"),
        discord.OptionChoice(name="competing", value="competing")])
    @discord.option(name="text", description="activity text", required=True)
    @discord.option(name="url", description="twitch.tv or youtube only link (to use with 'streaming' type)", required=False)
    async def set_activity(self, ctx: discord.ApplicationContext, activity: str, text: str, url: str):
        await ctx.defer(ephemeral=True)
        activity_enum = discord.enums.ActivityType[activity]
        # TODO: maintain current status
        await self.bot.change_presence(activity=discord.Activity(type=activity_enum, name=text, url=url))
        await ctx.respond(f"Bot activity set to: {activity} {text}{f" with {url}." if url else "."}")

    @activity_group.command(name="clear", description="clear current bot activity", default_permission=False)
    async def clear_activity(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)
        # TODO: maintain current status
        await self.bot.change_presence(activity=None)
        await ctx.respond(f"Bot activity cleared")

    @discord.slash_command(name="avatar", description="set the bot's avatar", default_permission=False)
    @discord.option(name="avatar", description="new bot avatar", required=True, input_type=discord.SlashCommandOptionType.attachment)
    async def avatar(self, ctx: discord.ApplicationContext, avatar: discord.Attachment):
        await ctx.defer(ephemeral=True)
        data = await avatar.read()
        await self.bot.user.edit(avatar=data)
        await ctx.respond(f"Avatar set to {avatar.filename}")

    @commands.Cog.listener()
    async def on_ready(self):
        # TODO: cache the current status and activity to be able to reset them after a bot restart.
        print(f'Presence module ready')

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        # If the message mentions us and have not been sent by a bot, react with :eyes:
        if not message.author.bot and self.bot.user in message.mentions:
            await message.add_reaction('👀')

def setup(bot):
    bot.add_cog(Presence(bot))