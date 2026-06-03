import datetime
import discord

class ConfirmCopyView(discord.ui.View):
    def __init__(self, requester_id: int, *args, **kwargs):
        super().__init__(timeout=60.0, *args, **kwargs)
        self.requester_id = requester_id
        self.value = None

    @discord.ui.button(label="Confirm Copy", style=discord.ButtonStyle.danger)
    async def confirm(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message("Only the person who initiated this move can confirm it.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        self.value = True
        self.stop()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message("Only the person who initiated this move can cancel it.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        self.value = False
        self.stop()


class ConfirmMoveView(discord.ui.View):
    def __init__(self, cog):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="Finalize Move", style=discord.ButtonStyle.success, custom_id="finalize_thread_move")
    async def finalize(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        transaction = await collection.find_one({"thread_id": str(interaction.channel.id)})
        if not transaction:
            await interaction.followup.send("No active move transaction found for this thread.", ephemeral=True)
            return

        # Enforce requester lock
        if str(interaction.user.id) != transaction.get("requester_id"):
            await interaction.followup.send(
                f"Only <@{transaction.get('requester_id')}> (who initiated this move) can finalize it.",
                ephemeral=True
            )
            return

        thread = interaction.channel
        # Fetch current messages in the thread
        try:
            thread_messages = [msg async for msg in thread.history(limit=None)]
        except Exception as e:
            await interaction.followup.send(f"Failed to read thread history: {e}", ephemeral=True)
            return

        thread_msg_ids = {str(msg.id) for msg in thread_messages}
        original_ids_to_delete = []
        mappings = transaction.get("mappings", {})
        for new_id, old_id in mappings.items():
            if new_id in thread_msg_ids:
                original_ids_to_delete.append(int(old_id))

        main_channel_id = int(transaction["channel_id"])
        main_channel = self.cog.bot.get_channel(main_channel_id)

        # Delete migration notice message in main channel first to free the channel
        wait_msg_id = transaction.get("wait_message_id")
        if main_channel and wait_msg_id:
            try:
                wait_msg = main_channel.get_partial_message(int(wait_msg_id))
                await wait_msg.delete()
            except Exception as e:
                self.cog.log(f"Failed to delete migration notice: {e}")

        # Post the Move Finalized notice to the main channel
        anchor_url = f"https://discord.com/channels/{interaction.guild_id}/{main_channel.id}/{thread.id}"
        try:
            await main_channel.send(
                f"🧹 **Move finalized**: Subsequent messages after [this message]({anchor_url}) "
                f"have been moved to {thread.mention}."
            )
        except Exception as e:
            self.cog.log(f"Failed to send Move Finalized notice to main channel: {e}")

        # Deletion of remaining messages from the main channel
        if main_channel and original_ids_to_delete:
            objects_to_delete = [discord.Object(id=oid) for oid in original_ids_to_delete]
            try:
                await self.cog.delete_messages_helper(main_channel, objects_to_delete)
            except Exception as e:
                self.cog.log(f"Failed to delete original messages: {e}")
                await interaction.followup.send(f"Failed to delete original messages: {e}", ephemeral=True)
                return

        # Clean up database
        await collection.delete_one({"_id": transaction["_id"]})

        # Try to delete the confirmation message
        confirm_msg_id = int(transaction["confirm_message_id"])
        try:
            confirm_msg = await thread.fetch_message(confirm_msg_id)
            await confirm_msg.delete()
        except discord.NotFound:
            pass

        await interaction.followup.send("Move finalized! Original messages have been deleted from the main channel.", ephemeral=True)
        await thread.send(f"🧹 **Move finalized**: Original messages have been cleaned up from the main channel by {interaction.user.mention}.")

    @discord.ui.button(label="Cancel Move", style=discord.ButtonStyle.danger, custom_id="cancel_thread_move")
    async def cancel(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        transaction = await collection.find_one({"thread_id": str(interaction.channel.id)})
        if not transaction:
            await interaction.followup.send("No active move transaction found for this thread.", ephemeral=True)
            return

        # Enforce requester lock
        if str(interaction.user.id) != transaction.get("requester_id"):
            await interaction.followup.send(
                f"Only <@{transaction.get('requester_id')}> (who initiated this move) can cancel it.",
                ephemeral=True
            )
            return

        main_channel_id = int(transaction["channel_id"])
        main_channel = self.cog.bot.get_channel(main_channel_id)

        # Delete migration notice message in main channel
        wait_msg_id = transaction.get("wait_message_id")
        if main_channel and wait_msg_id:
            try:
                wait_msg = main_channel.get_partial_message(int(wait_msg_id))
                await wait_msg.delete()
            except Exception as e:
                self.cog.log(f"Failed to delete migration notice: {e}")

        # Clean up database
        await collection.delete_one({"_id": transaction["_id"]})

        # Delete the thread
        thread = interaction.channel
        try:
            await thread.delete(reason=f"Move cancelled by {interaction.user}")
        except discord.HTTPException as e:
            self.cog.log(f"Failed to delete thread on cancel: {e}")
            await interaction.followup.send("Failed to delete thread, but the move transaction was aborted.", ephemeral=True)
