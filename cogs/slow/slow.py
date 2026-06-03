import datetime
import discord
from discord import option
from discord.ext import commands
from discord.commands import default_permissions
from src import FriendlyFire, BaseCog

class Slow(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'slow', {
            "modChannel": None,
            "timeFrame": 60,
            "slowmodeDelay": 15
        })
        # Track active requests in memory: channel_id -> (user_id, timestamp)
        self.active_requests = {}

    @discord.slash_command(name="slow", description="Request to slow down the discussion in this channel", contexts=[discord.InteractionContextType.guild])
    async def slow(self, ctx: discord.ApplicationContext):
        if not isinstance(ctx.channel, (discord.TextChannel, discord.Thread)):
            await ctx.respond(self.bot.t('slow.non_text_channel', ctx.guild_id), ephemeral=True)
            return

        # Retrieve settings
        mod_channel_id = self.config.get('modChannel', ctx.guild_id)
        time_frame = self.config.get('timeFrame', ctx.guild_id) or 60
        slowmode_delay = self.config.get('slowmodeDelay', ctx.guild_id) or 15

        # Check if slowmode is already active
        if ctx.channel.slowmode_delay >= slowmode_delay:
            await ctx.respond(self.bot.t('slow.already_active', ctx.guild_id), ephemeral=True)
            return

        now = datetime.datetime.now(datetime.timezone.utc)
        previous_request = self.active_requests.get(ctx.channel.id)

        is_second_request = False
        if previous_request:
            prev_user_id, prev_timestamp = previous_request
            # Check if within timeFrame window
            if (now - prev_timestamp).total_seconds() <= time_frame:
                is_second_request = True

        if is_second_request:
            # Trigger slowmode
            try:
                await ctx.channel.edit(slowmode_delay=slowmode_delay)
            except discord.Forbidden:
                await ctx.respond(self.bot.t('slow.no_permission', ctx.guild_id), ephemeral=True)
                return
            except discord.HTTPException as e:
                await ctx.respond(self.bot.t('slow.failed', ctx.guild_id, error=str(e)), ephemeral=True)
                return

            # Ephemeral response to the reporter
            await ctx.respond(
                self.bot.t('slow.activated_ephemeral', ctx.guild_id),
                ephemeral=True
            )

            # Public announcement in channel
            await ctx.channel.send(
                self.bot.t('slow.activated_public', ctx.guild_id, delay=slowmode_delay)
            )

            # Notify moderators
            if mod_channel_id:
                mod_channel = ctx.guild.get_channel(int(mod_channel_id))
                if mod_channel:
                    try:
                        await mod_channel.send(
                            self.bot.t('slow.activated_mod', ctx.guild_id, user=ctx.author.mention, channel=ctx.channel.mention, delay=slowmode_delay)
                        )
                    except discord.HTTPException as e:
                        self.log(f"Failed to send alert to modChannel: {e}")

            # Clear the request window
            self.active_requests.pop(ctx.channel.id, None)

        else:
            # First request
            self.active_requests[ctx.channel.id] = (ctx.author.id, now)

            # Ephemeral response to the reporter
            await ctx.respond(
                self.bot.t('slow.first_request_ephemeral', ctx.guild_id),
                ephemeral=True
            )

            # Public notice in channel
            await ctx.channel.send(
                self.bot.t('slow.first_request_public', ctx.guild_id)
            )

            # Notify moderators
            if mod_channel_id:
                mod_channel = ctx.guild.get_channel(int(mod_channel_id))
                if mod_channel:
                    try:
                        await mod_channel.send(
                            self.bot.t('slow.first_request_mod', ctx.guild_id, user=ctx.author.mention, channel=ctx.channel.mention)
                        )
                    except discord.HTTPException as e:
                        self.log(f"Failed to send alert to modChannel: {e}")
                else:
                    self.log(f"Mod channel with ID {mod_channel_id} not found in guild.")
            else:
                self.log("No modChannel configured. Staff could not be alerted.")


    @discord.slash_command(name="unslow", description="Turn off slowmode in this channel", contexts=[discord.InteractionContextType.guild])
    @default_permissions(manage_messages=True)
    async def unslow(self, ctx: discord.ApplicationContext):
        if not isinstance(ctx.channel, (discord.TextChannel, discord.Thread)):
            await ctx.respond(self.bot.t('slow.non_text_channel', ctx.guild_id), ephemeral=True)
            return

        # Disable slowmode
        try:
            await ctx.channel.edit(slowmode_delay=0)
        except discord.Forbidden:
            await ctx.respond(self.bot.t('slow.no_permission', ctx.guild_id), ephemeral=True)
            return
        except discord.HTTPException as e:
            await ctx.respond(self.bot.t('slow.unslow.failed', ctx.guild_id, error=str(e)), ephemeral=True)
            return

        # Clear any active requests for this channel
        self.active_requests.pop(ctx.channel.id, None)

        await ctx.respond(self.bot.t('slow.unslow.disabled', ctx.guild_id))


    # Configuration commands
    slowconfigGroup = discord.SlashCommandGroup(
        name="slowconfig",
        description="Configure slow mode request settings",
        default_member_permissions=discord.Permissions(administrator=True),
        contexts=[discord.InteractionContextType.guild]
    )

    @slowconfigGroup.command(name="setchannel", description="Set the channel where moderators are notified")
    @option(name="channel", description="Moderation channel", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.config.set('modChannel', str(channel.id), guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('slow.config.channel_success', ctx.guild_id, channel=channel.mention))

    @slowconfigGroup.command(name="settime", description="Set the request time window (in minutes)")
    @option(name="minutes", description="Timeframe in minutes (default 30)", required=True, input_type=int)
    async def set_time(self, ctx: discord.ApplicationContext, minutes: int):
        await ctx.defer(ephemeral=True)
        if minutes < 1:
            await ctx.respond(self.bot.t('slow.config.time_error', ctx.guild_id))
            return
        self.config.set('timeFrame', minutes * 60, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('slow.config.time_success', ctx.guild_id, minutes=minutes))

    @slowconfigGroup.command(name="setdelay", description="Set the slowmode delay to apply (in seconds)")
    @option(name="seconds", description="Slowmode delay in seconds (default 15)", required=True, input_type=int)
    async def set_delay(self, ctx: discord.ApplicationContext, seconds: int):
        await ctx.defer(ephemeral=True)
        if seconds < 1:
            await ctx.respond(self.bot.t('slow.config.delay_error', ctx.guild_id))
            return
        self.config.set('slowmodeDelay', seconds, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('slow.config.delay_success', ctx.guild_id, seconds=seconds))

def setup(bot):
    bot.add_cog(Slow(bot))
