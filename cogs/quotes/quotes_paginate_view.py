import json
from datetime import datetime

import discord
from discord import ButtonStyle
from pymongo.asynchronous.collection import AsyncCollection


class QuotesPaginateView(discord.ui.View):
    def __init__(self, quotes_cog, quotes: list, current_id: int):
        super().__init__(timeout=600)
        self.quotes_cog = quotes_cog
        self.quotes = quotes
        self.current_id = current_id
        self.show_payload = False
        self.message: discord.Message = None
        self.update_buttons()

    def get_embed(self) -> discord.Embed:
        quote = self.quotes[self.current_id]
        count = len(self.quotes)
        checked_str = 'checked' if quote.get('checked') else 'unchecked'
        color = discord.Color.blue() if quote.get('checked') else discord.Color.dark_theme()

        submitter_id = quote.get('submitted_by_id', '')
        submitter = f"<@{submitter_id}> ({quote['submitted_by']})" if submitter_id else quote.get('submitted_by', 'Unknown')

        embed = discord.Embed(
            title=f"Quote #{self.current_id + 1}/{count} ({checked_str})",
            description=f"Submitted by {submitter}",
            color=color,
            timestamp=datetime.fromtimestamp(quote['timestamp'] / 1000),
        )
        embed.set_footer(text=quote.get('author', ''))

        if self.show_payload:
            payload = {k: v for k, v in quote.items() if k != '_id'}
            embed.add_field(name='​', value=f'```json\n{json.dumps(payload, indent=2)}\n```', inline=False)

        embed.add_field(name='​', value=quote['quote'], inline=False)

        return embed

    def update_buttons(self):
        quote = self.quotes[self.current_id]
        for child in self.children:
            if not isinstance(child, discord.ui.Button):
                continue
            if child.label == 'Safe':
                child.style = ButtonStyle.primary if quote.get('safe') else ButtonStyle.secondary
            elif child.label == 'Unsafe':
                child.style = ButtonStyle.primary if not quote.get('safe') else ButtonStyle.secondary
            elif child.label in ('Show Payload', 'Hide Payload'):
                child.label = 'Hide Payload' if self.show_payload else 'Show Payload'

    async def on_timeout(self):
        if self.message:
            try:
                await self.message.edit(view=None)
            except discord.NotFound:
                pass

    async def _respond(self, interaction: discord.Interaction):
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)

    @discord.ui.button(label='Safe', style=ButtonStyle.secondary, row=0)
    async def safe_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        quote = self.quotes[self.current_id]
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(interaction.guild_id, 'quotes')
        await collection.update_one({'_id': quote['_id']}, {'$set': {'safe': True, 'checked': True}})
        quote['safe'] = True
        quote['checked'] = True
        await self._respond(interaction)

    @discord.ui.button(label='Unsafe', style=ButtonStyle.secondary, row=0)
    async def unsafe_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        quote = self.quotes[self.current_id]
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(interaction.guild_id, 'quotes')
        await collection.update_one({'_id': quote['_id']}, {'$set': {'safe': False, 'checked': True}})
        quote['safe'] = False
        quote['checked'] = True
        await self._respond(interaction)

    @discord.ui.button(label='Prev', style=ButtonStyle.gray, row=1)
    async def prev_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        self.current_id = (self.current_id - 1) % len(self.quotes)
        self.show_payload = False
        await self._respond(interaction)

    @discord.ui.button(label='Next', style=ButtonStyle.gray, row=1)
    async def next_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        self.current_id = (self.current_id + 1) % len(self.quotes)
        self.show_payload = False
        await self._respond(interaction)

    @discord.ui.button(label='Show Payload', style=ButtonStyle.gray, row=1)
    async def toggle_payload(self, button: discord.ui.Button, interaction: discord.Interaction):
        self.show_payload = not self.show_payload
        await self._respond(interaction)

    @discord.ui.button(label='Delete', style=ButtonStyle.red, row=2)
    async def delete_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        quote = self.quotes[self.current_id]
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(interaction.guild_id, 'quotes')
        await collection.delete_one({'_id': quote['_id']})
        self.quotes.pop(self.current_id)

        if not self.quotes:
            self.disable_all_items()
            await interaction.response.edit_message(content='No quotes remaining.', embed=None, view=self)
            return

        if self.current_id >= len(self.quotes):
            self.current_id = len(self.quotes) - 1
        self.show_payload = False
        await self._respond(interaction)
