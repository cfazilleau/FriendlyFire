import datetime
import random
from typing import TypedDict

import discord
from discord import option

from discord.ext import commands
from discord.utils import format_dt
from pymongo.asynchronous.collection import AsyncCollection

from cogs.invites.greetings_view import Greeting, PaginatorView
from src import FriendlyFire, BaseCog

class InviteEntry(TypedDict):
    author_id: int
    code: str
    expires: int

class Invites(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'invites', {
            "inviteMaxAge": 20*60,
            "inviteRole": None,
            "invitesChannel": None,
        })

    greetingsGroup = discord.SlashCommandGroup(name="greetings", description="manage greetings", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])

    @greetingsGroup.command(name="create", description="create a greeting")
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
        if not greetings:
            await ctx.respond("No greetings have been created yet.")
            return
        view = PaginatorView(self, greetings, id)
        await ctx.respond(
            content=view.get_content(),
            embed=view.get_embed(),
            view=view
        )

    @discord.slash_command(name="invite", description="Generates a temporary invite", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])
    async def invite(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)

        author = ctx.author
        invite_max_age = self.config.get('inviteMaxAge', ctx.guild_id)

        invite = await ctx.channel.create_invite(temporary=True, max_age=invite_max_age, max_uses=1)
        invite_entry = InviteEntry(
            author_id=author.id,
            code=invite.code,
            expires=int(invite.expires_at.timestamp()) if invite.expires_at else None,
        )
        collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "invites")
        await collection.insert_one(invite_entry)
        expiry_text = f", It will be valid until {format_dt(invite.expires_at)}" if invite.expires_at else " (permanent)"
        await ctx.respond(f"Here is your invite link: {invite.url}{expiry_text}.")

    @discord.slash_command(name="test_join", description="Fakes a member joining the server to test greetings and roles", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])
    @option(name="user", description="user to fake joining", required=True, input_type=discord.SlashCommandOptionType.user)
    async def test_join(self, ctx: discord.ApplicationContext, user: discord.User):
        await ctx.defer(ephemeral=True)
        member = ctx.guild.get_member(user.id)
        if member is None:
            await ctx.respond(f"{user.mention} is not a member of this server.")
            return
        await self.on_member_join(member)
        await ctx.respond("test_join succeeded!")

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        # Add default role
        new_role_id = self.config.get('inviteRole', member.guild.id)
        if new_role_id is not None:
            role_to_add = member.guild.get_role(int(new_role_id))
            if role_to_add is None:
                self.log("no role found, ignoring for new member.")
            else:
                try:
                    await member.add_roles(role_to_add)
                except discord.Forbidden:
                    self.log(f"Failed to add role {role_to_add.name} due to missing permissions.")
                except discord.HTTPException as e:
                    self.log(f"HTTPException while adding role: {e}")

        inviter_id = None
        try:
            server_invites = await member.guild.invites()
            collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(member.guild.id, "invites")
            recorded_invites = await collection.find({}).to_list()

            self.log(f"{len(server_invites)} invites server-side, {len(recorded_invites)} invites bot-side.")

            server_invites_set = {i.code for i in server_invites}
            for invite in recorded_invites:
                code = invite['code']
                if code not in server_invites_set:
                    # Invite disappeared from server — if it hasn't expired it was consumed
                    expires = invite.get('expires')
                    if expires is None or expires > datetime.datetime.now().timestamp():
                        inviter = member.guild.get_member(invite['author_id'])
                        inviter_name = inviter.name if inviter else f"<unknown {invite['author_id']}>"
                        self.log(f"{member.name} joined \"{member.guild.name}\" using one-time invite {code} by {inviter_name}")
                        inviter_id = invite['author_id']
                        await collection.delete_one({"code": code})
                        break
                    else:
                        # Clean up expired invite code from MongoDB on-the-fly
                        await collection.delete_one({"code": code})
        except discord.Forbidden:
            self.log("Missing MANAGE_GUILD permission, skipping invite tracking.")

        if inviter_id is None:
            self.log(f"{member.name} joined using unknown invite code.")

        announcement_channel_id = self.config.get('invitesChannel', member.guild.id)
        if announcement_channel_id:
            announcement_channel = member.guild.get_channel(int(announcement_channel_id))
            if announcement_channel is not None:
                greetings_collection: AsyncCollection[Greeting] = await self.bot.mongo.get_collection(member.guild.id, "greetings")
                greetings = await greetings_collection.find({}).to_list()
                greeting_text = random.choice(greetings)['greeting'] if greetings else None

                inviter_mention = f"invité.e par <@{inviter_id}>\n" if inviter_id is not None else ""
                greeting_suffix = f"\n\n{greeting_text}" if greeting_text else ""
                description = f"Bienvenue a <@{member.id}>, {inviter_mention}sur le discord de [Phoenix Legacy](https://phxlgc.com)!{greeting_suffix}"
                embed = discord.Embed(
                    title="Bienvenue!",
                    thumbnail=member.avatar.url if member.avatar else None,
                    color=member.accent_color or discord.Color.default(),
                    description=description,
                )
                await announcement_channel.send(embed=embed)

    @commands.Cog.listener()
    async def on_ready(self):
        self.log('clearing expired invites...')
        for guild in self.bot.guilds:
            collection: AsyncCollection[InviteEntry] = await self.bot.mongo.get_collection(guild.id, "invites")
            recorded_invites = await collection.find({}).to_list()
            invites_num = len(recorded_invites)

            for invite in recorded_invites:
                if invite['expires'] is not None and invite['expires'] - datetime.datetime.now().timestamp() < 0:
                    await collection.delete_one({"code": invite['code']})
                    invites_num -= 1
                    self.log(f"Deleted expired invite: {invite['code']}. {invites_num} remaining.")

def setup(bot):
    bot.add_cog(Invites(bot))