import datetime
import discord
from discord.ext import commands
from discord.commands import default_permissions
from src import FriendlyFire, BaseCog

from .views import ConfirmMoveView
from .modal import MoveToThreadModal

class Threads(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'threads', {
            "confirmThreshold": 50,
            "maxMessages": 1000
        })

    @commands.Cog.listener()
    async def on_ready(self):
        self.bot.add_view(ConfirmMoveView(self))
        self.log("Registered persistent confirmation view.")

    @commands.message_command(name="Move to Thread")
    @default_permissions(manage_messages=True)
    async def move_to_thread(self, ctx: discord.ApplicationContext, message: discord.Message):
        # Safety checks
        if not ctx.guild:
            await ctx.respond("This command can only be used in a server.", ephemeral=True)
            return

        if isinstance(message.channel, discord.Thread):
            await ctx.respond("Cannot create a thread inside a thread.", ephemeral=True)
            return

        if message.thread is not None:
            await ctx.respond("A thread already exists on this message.", ephemeral=True)
            return

        # Hard permission check on the invoking user
        if not ctx.author.guild_permissions.manage_messages:
            await ctx.respond("You need the `Manage Messages` permission to use this command.", ephemeral=True)
            return

        # Send modal
        modal = MoveToThreadModal(message=message, cog=self, title="Move Messages to Thread")
        await ctx.send_modal(modal)

    async def delete_messages_helper(self, channel: discord.TextChannel, messages: list[discord.Object]):
        now = datetime.datetime.now(datetime.timezone.utc)
        under_14_days = []
        over_14_days = []

        for msg in messages:
            # discord.Object has a created_at property which returns timezone-aware datetime in UTC
            # Use total_seconds() < 13 days to have a safety margin for bulk delete
            if (now - msg.created_at).total_seconds() < 13 * 86400:
                under_14_days.append(msg)
            else:
                over_14_days.append(msg)

        # Bulk delete under 14 days in chunks of 100
        for i in range(0, len(under_14_days), 100):
            chunk = under_14_days[i:i+100]
            try:
                # TextChannel.delete_messages accepts an iterable of Snowflake (including discord.Object)
                await channel.delete_messages(chunk)
            except discord.HTTPException as e:
                self.log(f"Failed to bulk delete chunk of messages: {e}")
                # Fallback to individual deletion
                for msg in chunk:
                    try:
                        await channel.get_partial_message(msg.id).delete()
                    except discord.HTTPException as de:
                        self.log(f"Failed to delete message {msg.id}: {de}")

        # Delete over 14 days individually
        for msg in over_14_days:
            try:
                await channel.get_partial_message(msg.id).delete()
            except discord.HTTPException as e:
                self.log(f"Failed to delete message {msg.id}: {e}")

def setup(bot):
    bot.add_cog(Threads(bot))
