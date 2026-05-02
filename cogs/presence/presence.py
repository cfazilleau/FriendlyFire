import discord
from discord.ext import commands

from src import BaseCog


class Presence(BaseCog):
    def __init__(self, bot: discord.Bot):
        super().__init__(bot, 'presence', {
            'status': 'online',
            'activity': None,
        })

        self.status = self.config.get('status')
        self.activity = self.config.get('activity')

    def save_config(self):
        self.config.set('status', self.status)
        self.config.set('activity', self.activity)

    async def apply_status(self):
        try:
            status = discord.enums.Status[self.status]
        except KeyError:
            self.log(f'Unknown status "{self.status}", defaulting to online.')
            status = discord.enums.Status.online

        activity = None
        if self.activity is not None:
            try:
                activity = discord.Activity(
                    type=discord.enums.ActivityType[self.activity['type']],
                    name=self.activity['name'],
                    url=self.activity['url'],
                )
            except KeyError:
                self.log(f'Unknown activity type "{self.activity["type"]}", skipping activity.')

        self.log(f"Setting status to {status} and activity to {self.activity}")
        await self.bot.change_presence(status=status, activity=activity)

    @discord.slash_command(name="status", description="update current bot status", default_member_permissions=discord.Permissions(administrator=True))
    @discord.option(name="status", parameter_name="new_status", description="status of the bot", required=True, choices=[
        discord.OptionChoice(name="online", value="online"),
        discord.OptionChoice(name="idle", value="idle"),
        discord.OptionChoice(name="do not disturb", value="dnd"),
        discord.OptionChoice(name="invisible", value="invisible")])
    async def status(self, ctx: discord.ApplicationContext, new_status: str):
        await ctx.defer(ephemeral=True)

        self.status = new_status
        self.save_config()

        await self.apply_status()
        await ctx.respond(f"Bot status set to: {new_status}")

    activity_group = discord.SlashCommandGroup(name="activity", description="manage current bot activity", default_member_permissions=discord.Permissions(administrator=True))

    @activity_group.command(name="set", description="set current bot activity")
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

        self.activity = { 'type':activity, 'name':text, 'url':url }
        self.save_config()

        await self.apply_status()
        await ctx.respond(f"Bot activity set to: {activity} {text}{f' with {url}.' if url else '.'}")

    @activity_group.command(name="clear", description="clear current bot activity")
    async def clear_activity(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)

        self.activity = None
        self.save_config()

        await self.apply_status()
        await ctx.respond(f"Bot activity cleared")

    @discord.slash_command(name="avatar", description="set the bot's avatar", default_member_permissions=discord.Permissions(administrator=True))
    @discord.option(name="avatar", description="new bot avatar", required=True, input_type=discord.SlashCommandOptionType.attachment)
    async def avatar(self, ctx: discord.ApplicationContext, avatar: discord.Attachment):
        await ctx.defer(ephemeral=True)
        data = await avatar.read()
        await self.bot.user.edit(avatar=data)
        await ctx.respond(f"Avatar set to {avatar.filename}")

    @commands.Cog.listener()
    async def on_ready(self):
        await self.apply_status()

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        # If the message mentions us and have not been sent by a bot, react with :eyes:
        if not message.author.bot and self.bot.user in message.mentions:
            await message.add_reaction('\U0001f440')

def setup(bot):
    bot.add_cog(Presence(bot))
