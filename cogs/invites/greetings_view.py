from typing import TypedDict

import discord
from discord import ButtonStyle
from pymongo.asynchronous.collection import AsyncCollection

class Greeting(TypedDict):
    greeting: str

class PaginatorView(discord.ui.View):
    def __init__(self, invites_cog, pages, start_id, guild_id: int):
        super().__init__(timeout=60)
        self.invites_cog = invites_cog
        self.pages = pages
        self.guild_id = guild_id
        self.current_page = max(1, min(start_id, len(self.pages))) - 1

        # Localize buttons dynamically
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                if child.custom_id == "prev_greeting_btn":
                    child.label = self.invites_cog.bot.t('invites.btn_prev', self.guild_id)
                elif child.custom_id == "next_greeting_btn":
                    child.label = self.invites_cog.bot.t('invites.btn_next', self.guild_id)
                elif child.custom_id == "delete_greeting_btn":
                    child.label = self.invites_cog.bot.t('invites.btn_delete', self.guild_id)

        self.update_buttons()

    @staticmethod
    def greeting_to_embed(greeting: Greeting) -> discord.Embed:
        return discord.Embed(color=discord.Color.green(), description=greeting['greeting'])

    def get_content(self) -> str:
        return self.invites_cog.bot.t('invites.greeting_page_count', self.guild_id, current=self.current_page + 1, total=len(self.pages))

    def get_embed(self) -> discord.Embed:
        return self.greeting_to_embed(self.pages[self.current_page])

    async def update_message(self, interaction: discord.Interaction):
        self.update_buttons()
        await interaction.response.edit_message(
            content=self.get_content(),
            embed=self.get_embed(),
            view=self
        )

    async def delete_current_greeting(self, interaction: discord.Interaction):
        greeting = self.pages[self.current_page]
        collection: AsyncCollection[Greeting] = await self.invites_cog.bot.mongo.get_collection(interaction.guild_id, "greetings")
        await collection.delete_one({"_id": greeting['_id']})
        self.pages.remove(greeting)

    def update_buttons(self):
        # Iterate through the view's children to update button states and labels
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                if child.custom_id == "prev_greeting_btn":
                    child.disabled = (self.current_page <= 0)
                elif child.custom_id == "next_greeting_btn":
                    child.disabled = (self.current_page >= len(self.pages) - 1)

    @discord.ui.button(label="Prev", style=ButtonStyle.gray, custom_id="prev_greeting_btn")
    async def prev_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        if self.current_page > 0:
            self.current_page -= 1
            self.invites_cog.log(f"Greeting paginator Prev clicked by {interaction.user.name}. New page: {self.current_page + 1}", interaction.guild)
            await self.update_message(interaction)

    @discord.ui.button(label="Delete", style=ButtonStyle.red, custom_id="delete_greeting_btn")
    async def delete_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        greeting = self.pages[self.current_page]
        self.invites_cog.log(f"Greeting paginator Delete clicked by {interaction.user.name}. Deleted greeting ID {greeting['_id']}", interaction.guild)
        await self.delete_current_greeting(interaction)
        if not self.pages:
            self.disable_all_items()
            await interaction.response.edit_message(content=self.invites_cog.bot.t('invites.no_greetings_remaining', self.guild_id), embed=None, view=self)
            return
        if self.current_page >= len(self.pages):
            self.current_page = len(self.pages) - 1
        await self.update_message(interaction)

    @discord.ui.button(label="Next", style=ButtonStyle.gray, custom_id="next_greeting_btn")
    async def next_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        if self.current_page + 1 < len(self.pages):
            self.current_page += 1
            self.invites_cog.log(f"Greeting paginator Next clicked by {interaction.user.name}. New page: {self.current_page + 1}", interaction.guild)
            await self.update_message(interaction)