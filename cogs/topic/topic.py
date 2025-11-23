import io
from typing import TypedDict

import discord
import json

from discord import option
from discord.ext import commands
from pymongo.asynchronous.collection import AsyncCollection

from src import FriendlyFire

class TopicEntry(TypedDict):
    messageId: str
    channelId: str
    roleId: str
    roleName: str

class Topic(commands.Cog):
    def __init__(self, bot: FriendlyFire):
        self.bot = bot

    # get the topic types from the config file
    config = io.open(f'config/{__qualname__.lower()}.json', 'r', encoding='utf-8').read()
    topicTypes = json.loads(config)

    # generate type options depending on the topic types
    choices = []
    for topic in topicTypes.keys():
        choices.append(discord.OptionChoice(name=topic, value=topic))

    # make sure we have existing topic types
    assert len(choices) > 0

    topicGroup = discord.SlashCommandGroup(name="topic", description="manage topics")

    @topicGroup.command(name="create", description="create a topic", default_permission=False)
    @option(name="name", description="name of the new topic", required=True)
    @option(name="type", description="type of topic", required=True, choices=choices)
    @option(name="image", description="URL of an image for this topic", required=False)
    async def create_topic(self, ctx: discord.ApplicationContext, name: str, input_type: str, image: str = None):
        await ctx.defer(ephemeral=True)

        #retrieve the corresponding type data
        type_descriptor = self.topicTypes[input_type]

        # create the role
        color = discord.Color(int(type_descriptor["color"], 16))
        role = await ctx.guild.create_role(name=name, color=color, mentionable=True)

        # send a new embed message for users to react to
        embed = discord.Embed(
            title=f"{name} {type_descriptor["emoji"]} {type_descriptor["text"]}",
            color=color,
            footer=discord.embeds.EmbedFooter(text="Clique sur ✅ pour t'abonner à ce topic"),
            # TODO: maybe cache the picture before, so if the original link dies, we still have a reliable url
            image=image
        )

        message = await ctx.channel.send(embed=embed)
        await message.add_reaction("✅")

        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        await collection.insert_one(TopicEntry(
            messageId=str(message.id),
            channelId=str(message.channel.id),
            roleId=str(role.id),
            roleName=role.name
        ))
        await ctx.respond("Created topic successfully!")

    @topicGroup.command(name="edit", description="edit a topic", default_permission=False)
    @option(name="role", description="current role of the topic", required=True, input_type=discord.SlashCommandOptionType.role)
    @option(name="type", description="type of topic", required=True, choices=choices)
    @option(name="name", description="name of the new topic", required=False)
    @option(name="image", description="URL of an image for this topic", required=False)
    async def edit_topic(self, ctx: discord.ApplicationContext, role: discord.Role, input_type: str, name: str = None, image: str = None):
        await ctx.defer(ephemeral=True)

        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        topic = await collection.find_one(filter={"roleId": str(role.id)})
        type_descriptor = self.topicTypes[input_type]
        color = discord.Color(int(type_descriptor["color"], 16))

        message = await ctx.fetch_message(topic["messageId"])
        prev_embed = message.embeds[0]

        if name is None:
            name = topic["name"]
        else:
            await role.edit(name=name)

        if image is None:
            image = prev_embed.image

        # create a new embed message to update
        embed = discord.Embed(
            title=f"{name} {type_descriptor["emoji"]} {type_descriptor["text"]}",
            color=color,
            footer=discord.embeds.EmbedFooter(text="Clique sur ✅ pour t'abonner à ce topic"),
            image=image
        )

        await role.edit(color=color)
        await message.edit(embed=embed)
        await collection.update_one(filter={"_id": topic["_id"]}, update={"$set": {
            "messageId": str(message.id),
            "channelId": str(message.channel.id),
            "roleId": str(role.id),
            "roleName": str(role.name)
        }})

        await ctx.respond("Updated topic successfully!")

    @topicGroup.command(name="delete", description="delete a topic", default_permission=False)
    @option(name="role", description="role of the topic", required=True)
    async def delete_topic(self, ctx: discord.ApplicationContext, role: discord.Role):
        await ctx.defer(ephemeral=True)
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        topic = await collection.find_one(filter={"roleId": str(role.id)})

        if topic is None:
            await ctx.respond("Topic not found in the database, you might need to delete this one manually")
            return

        message = await ctx.fetch_message(int(topic["messageId"]))
        await message.delete()
        await role.delete()
        await ctx.respond("Removed topic successfully!")

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent):
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(payload.guild_id, "topics")
        topic = await collection.find_one(filter={"messageId": str(payload.message_id)})
        if topic:
            guild = self.bot.get_guild(payload.guild_id)
            role = guild.get_role(int(topic["roleId"]))
            await payload.member.add_roles(role)
            print(f"Added role {role.name} to user {payload.member.name}")

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, payload: discord.RawReactionActionEvent):
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(payload.guild_id, "topics")
        topic = await collection.find_one(filter={"messageId": str(payload.message_id)})
        if topic:
            guild = self.bot.get_guild(payload.guild_id)
            role = guild.get_role(int(topic["roleId"]))
            member = await guild.fetch_member(payload.user_id)
            await member.remove_roles(role)
            print(f"Removed role {role.name} from user {member.name}")

def setup(bot):
    bot.add_cog(Topic(bot))