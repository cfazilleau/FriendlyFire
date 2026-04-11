import datetime
from typing import TypedDict

import discord
from discord import option

from discord.ext import commands
from discord.utils import format_dt
from pymongo.asynchronous.collection import AsyncCollection

from cogs.invites.greetings_view import Greeting, PaginatorView
from src import FriendlyFire
from src.config import Config

class InviteEntry(TypedDict):
    author_id: int
    code: str
    expires: int

class Invites(commands.Cog):
    def __init__(self, bot: FriendlyFire):
        self.bot = bot

        default_config = {
            "inviteMaxAge": 20*60,   # time in seconds, so 20 minutes times 60 secs
            "inviteRole": None,      # id of the role to add to new users (None to disable)
            "invitesChannel": None,  # id of the channel to send notifications in (None to disable)
        }
        self.config = Config('invites', default_config)

    greetingsGroup = discord.SlashCommandGroup(name="greetings", description="manage greetings")

    @greetingsGroup.command(name="create", description="create a greeting", default_permission=False)
    @option(name="text", description="greeting text", required=True)
    async def greetings_create(self, ctx: discord.ApplicationContext, text: str):
        await ctx.defer(ephemeral=True)
        collection: AsyncCollection[Greeting] = await self.bot.mongo.get_collection(ctx.guild_id, "greetings")
        await collection.insert_one(Greeting(greeting=text))
        await ctx.respond(f"Greetings created: {text}")

    @greetingsGroup.command(name="paginate")
    @option(name="id", description="id of the greeting to look for", required=False, input_type=int, default=0)
    async def paginate(self, ctx: discord.ApplicationContext, id: int):
        await ctx.defer(ephemeral=True)
        collection: AsyncCollection[Greeting] = await self.bot.mongo.get_collection(ctx.guild_id, "greetings")
        greetings = await collection.find({}).to_list()
        view = PaginatorView(self, greetings, id)
        await ctx.respond(
            content=view.get_content(),
            embed=view.get_embed(),
            view=view
        )

    @discord.slash_command(name="invite", description="Generates a temporary invite", default_permissions=False)
    async def invite(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)

        author = ctx.author
        invite_max_age = self.config.get('inviteMaxAge')

        invite = await ctx.channel.create_invite(temporary=True, max_age=invite_max_age)
        invite_entry = InviteEntry(
            author_id=author.id,
            code=invite.code,
            expires=int(invite.expires_at.timestamp())
        )
        collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "invites")
        await collection.insert_one(invite_entry)
        await ctx.respond(
            f"Here is your invite link: {invite.url}, It will be valid until {format_dt(invite.expires_at)}.")

    @discord.slash_command(name="test_join", description="Generates a temporary invite", default_permissions=False)
    @option(name="user", description="user to fake joining", required=True, input_type=discord.SlashCommandOptionType.user)
    async def test_join(self, ctx: discord.ApplicationContext, user: discord.User):
        await ctx.defer(ephemeral=True)
        member = ctx.guild.get_member(user.id)
        await self.on_member_join(member)
        await ctx.respond("test_join succeeded!")

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        # Add default role
        new_role_id = self.config.get('inviteRole', member.guild.id)
        if new_role_id is not None:
            role_to_add = member.guild.get_role(new_role_id)
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
            if invite['code'] not in [i.code for i in server_invites]:
                inviter = member.guild.get_member(invite['author_id'])
                print(f"{member.name} joined \"{member.guild.name}\" using the invite {invite['code']} by {inviter.name}")
                inviter_id = inviter.id
                await collection.delete_one({"code": invite['code']})
                break

        if inviter_id is None:
            print(f"{member.name} joined using unknown invite code.")

        announcement_channel_id = self.config.get('invitesChannel', member.guild.id)
        if announcement_channel_id:
            announcement_channel = member.guild.get_channel(announcement_channel_id)
            if announcement_channel is not None:
                embed = discord.Embed(
                    title="Bienvenue!",
                    thumbnail= member.avatar.url,
                    color=member.accent_color,
                    description=f"Bienvenue a <@{member.id}>, {f"invité.e par <@{inviter_id}>" if inviter_id is not None else ""} sur le discord de [Phoenix Legacy](https://phxlgc.com)!"
                )
                await announcement_channel.send(embed=embed)

    @commands.Cog.listener()
    async def on_ready(self):
        print(f'clearing expired invites...')
        for guild in self.bot.guilds:
            collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(guild.id, "invites")
            recorded_invites = await collection.find({}).to_list()
            invites_num = len(recorded_invites)

            for invite in recorded_invites:
                if invite['expires'] - datetime.datetime.now().timestamp() < 0:
                    await collection.delete_one({"code": invite['code']})
                    invites_num -= 1
                    print(f"Deleted expired invite: {invite['code']}. {invites_num} remaining.")

        print(f'Invites module ready')

def setup(bot):
    bot.add_cog(Invites(bot))