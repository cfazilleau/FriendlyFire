import json
from datetime import datetime

import discord
from discord import ButtonStyle
from pymongo.asynchronous.collection import AsyncCollection


class QuotesPaginateView(discord.ui.View):
    def __init__(self, quotes_cog, quotes: list, current_id: int, guild_id: int):
        super().__init__(timeout=86400)
        self.quotes_cog = quotes_cog
        self.quotes = quotes
        self.current_id = current_id
        self.guild_id = guild_id
        self.show_payload = False
        self.message: discord.Message = None

        # Dynamically translate labels
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                if child.custom_id == 'quotes_safe_btn':
                    child.label = self.quotes_cog.bot.t('quotes.btn_safe', self.guild_id)
                elif child.custom_id == 'quotes_unsafe_btn':
                    child.label = self.quotes_cog.bot.t('quotes.btn_unsafe', self.guild_id)
                elif child.custom_id == 'quotes_prev_btn':
                    child.label = self.quotes_cog.bot.t('quotes.btn_prev', self.guild_id)
                elif child.custom_id == 'quotes_next_btn':
                    child.label = self.quotes_cog.bot.t('quotes.btn_next', self.guild_id)
                elif child.custom_id == 'quotes_payload_btn':
                    child.label = self.quotes_cog.bot.t('quotes.btn_hide_payload' if self.show_payload else 'quotes.btn_show_payload', self.guild_id)
                elif child.custom_id == 'quotes_delete_btn':
                    child.label = self.quotes_cog.bot.t('quotes.btn_delete', self.guild_id)

        self.update_buttons()

    def get_embed(self) -> discord.Embed:
        quote = self.quotes[self.current_id]
        count = len(self.quotes)
        checked_str = self.quotes_cog.bot.t('quotes.paginate_checked' if quote.get('checked') else 'quotes.paginate_unchecked', self.guild_id)
        color = discord.Color.blue() if quote.get('checked') else discord.Color.dark_theme()

        submitter_id = quote.get('submitted_by_id', '')
        submitter = f"<@{submitter_id}> ({quote['submitted_by']})" if submitter_id else quote.get('submitted_by', 'Unknown')

        embed = discord.Embed(
            title=self.quotes_cog.bot.t('quotes.paginate_title', self.guild_id, idx=self.current_id + 1, total=count, checked_str=checked_str),
            description=self.quotes_cog.bot.t('quotes.paginate_submitted_by', self.guild_id, submitter=submitter, quote=quote['quote']),
            color=color,
            timestamp=datetime.fromtimestamp(quote['timestamp'] / 1000),
        )
        embed.set_footer(text=quote.get('author', ''))

        if self.show_payload:
            payload = {k: v for k, v in quote.items() if k != '_id'}
            embed.add_field(name='​', value=f'```json\n{json.dumps(payload, indent=2)}\n```', inline=False)

        return embed

    def update_buttons(self):
        quote = self.quotes[self.current_id]
        for child in self.children:
            if not isinstance(child, discord.ui.Button):
                continue
            if child.custom_id == 'quotes_safe_btn':
                child.style = ButtonStyle.primary if quote.get('safe') else ButtonStyle.secondary
            elif child.custom_id == 'quotes_unsafe_btn':
                child.style = ButtonStyle.primary if not quote.get('safe') else ButtonStyle.secondary
            elif child.custom_id == 'quotes_payload_btn':
                child.label = self.quotes_cog.bot.t('quotes.btn_hide_payload' if self.show_payload else 'quotes.btn_show_payload', self.guild_id)

    async def on_timeout(self):
        if self.message:
            try:
                await self.message.edit(view=None)
            except discord.NotFound:
                pass

    async def refresh_view(self, interaction: discord.Interaction):
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)

    @discord.ui.button(label='Safe', style=ButtonStyle.secondary, row=0, custom_id='quotes_safe_btn')
    async def safe_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        quote = self.quotes[self.current_id]
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(interaction.guild_id, 'quotes')
        await collection.update_one({'_id': quote['_id']}, {'$set': {'safe': True, 'checked': True}})
        quote['safe'] = True
        quote['checked'] = True
        await self.refresh_view(interaction)

    @discord.ui.button(label='Unsafe', style=ButtonStyle.secondary, row=0, custom_id='quotes_unsafe_btn')
    async def unsafe_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        quote = self.quotes[self.current_id]
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(interaction.guild_id, 'quotes')
        await collection.update_one({'_id': quote['_id']}, {'$set': {'safe': False, 'checked': True}})
        quote['safe'] = False
        quote['checked'] = True
        await self.refresh_view(interaction)

    @discord.ui.button(label='Prev', style=ButtonStyle.gray, row=1, custom_id='quotes_prev_btn')
    async def prev_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        self.current_id = (self.current_id - 1) % len(self.quotes)
        self.show_payload = False
        await self.refresh_view(interaction)

    @discord.ui.button(label='Next', style=ButtonStyle.gray, row=1, custom_id='quotes_next_btn')
    async def next_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        self.current_id = (self.current_id + 1) % len(self.quotes)
        self.show_payload = False
        await self.refresh_view(interaction)

    @discord.ui.button(label='Show Payload', style=ButtonStyle.gray, row=1, custom_id='quotes_payload_btn')
    async def toggle_payload(self, button: discord.ui.Button, interaction: discord.Interaction):
        self.show_payload = not self.show_payload
        await self.refresh_view(interaction)

    @discord.ui.button(label='Delete', style=ButtonStyle.red, row=2, custom_id='quotes_delete_btn')
    async def delete_button(self, button: discord.ui.Button, interaction: discord.Interaction):
        quote = self.quotes[self.current_id]
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(interaction.guild_id, 'quotes')
        await collection.delete_one({'_id': quote['_id']})
        self.quotes.pop(self.current_id)

        if not self.quotes:
            self.disable_all_items()
            await interaction.response.edit_message(content=self.quotes_cog.bot.t('quotes.no_quotes_remaining', self.guild_id), embed=None, view=self)
            return

        if self.current_id >= len(self.quotes):
            self.current_id = len(self.quotes) - 1
        self.show_payload = False
        await self.refresh_view(interaction)
