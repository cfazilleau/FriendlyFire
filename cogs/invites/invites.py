import io
from typing import TypedDict

import discord
import json
from discord.ext import commands
from discord.utils import format_dt
from pymongo.asynchronous.collection import AsyncCollection

from src import FriendlyFire
from src.config import Config


class InviteEntry(TypedDict):
    author_id: int
    code: str
    expires: int

class Greeting(TypedDict):
    greeting: str

class Invites(commands.Cog):
    def __init__(self, bot: FriendlyFire):
        self.bot = bot
        self.config = Config('invites')

    @discord.slash_command(name="invite", description="Generates a temporary invite", default_permissions=False)
    async def invite(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)

        author = ctx.author
        invite_max_age = self.config.config['inviteMaxAge']

        invite = await ctx.channel.create_invite(temporary=True, max_age=invite_max_age)
        invite_entry = InviteEntry(
            author_id=author.id,
            code=invite.code,
            expires=int(invite.expires_at.timestamp())
        )
        collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "invites")
        await collection.insert_one(invite_entry)
        await ctx.respond(f"Here is your invite link: {invite.url}, It will be valid until {format_dt(invite.expires_at)}.")

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        # Add default role
        role_to_add = member.guild.get_role(self.config.config['inviteRole'])
        if role_to_add is None:
            print("no role found, ignoring for new member.")
        else:
            await member.add_roles(role_to_add)

        #remove existing invite
        server_invites = await member.guild.invites()
        collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(member.guild.id, "invites")
        recorded_invites = await collection.find({}).to_list()

        print(f"{len(server_invites)} invites server-side, {len(recorded_invites)} invites bot-side.")

        inviter_id = None
        for invite in recorded_invites:
            if invite.code not in server_invites:
                inviter = member.guild.get_member(invite.author_id)
                print(f"{member.name} joined \"{member.guild.name}\" using the invite {invite.code} by {inviter.name}")
                inviter_id = inviter.id
                await collection.delete_one({"code": invite.code})
                break

        if inviter_id is None:
            print(f"{member.name} joined using unknown invite code.")

        announcement_channel_id = self.config.config['invitesChannel']
        announcement_channel = member.guild.get_channel(announcement_channel_id)

        embed = discord.Embed(
            title="Bienvenue!",
            thumbnail= member.avatar.url,
            color=member.accent_color,
            description=f"Bienvenue a <@{member.id}>, {f"invité.e par <@{inviter_id}>" if inviter_id is not None else ""} sur le discord de [Phoenix Legacy](https://phxlgc.com)!"
        )
        await announcement_channel.send(embed=embed)

def setup(bot):
    bot.add_cog(Invites(bot))