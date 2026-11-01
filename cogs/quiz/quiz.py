import asyncio
from datetime import datetime, timedelta, timezone
from typing import NotRequired, TypedDict

import discord
from bson import ObjectId
from discord.ext import commands
from pymongo.asynchronous.collection import AsyncCollection

from src import FriendlyFire, BaseCog


# Events older than this when the bot sees them are marked expired instead of posted
EVENT_MAX_AGE = timedelta(minutes=15)
RETRY_MIN_SECONDS = 5
RETRY_MAX_SECONDS = 300
MEDALS = {1: "🥇", 2: "🥈", 3: "🥉"}


class QuizPlayer(TypedDict):
    rank: int
    displayName: str
    avatarUrl: str
    score: int


class QuizResults(TypedDict):
    activityTitle: str
    endedAt: datetime
    playerCount: int
    top: list[QuizPlayer]


class QuizRequester(TypedDict):
    discordId: str
    displayName: str


class BotEvent(TypedDict):
    _id: ObjectId
    type: str                   # 'post_results'
    sessionId: str
    requestedBy: QuizRequester
    createdAt: datetime
    status: str                 # 'pending' | 'posted' | 'failed' | 'expired'
    payload: QuizResults
    error: NotRequired[str]
    messageUrl: NotRequired[str]
    processedAt: NotRequired[datetime]


def _as_utc(value) -> datetime | None:
    # pymongo returns naive datetimes that are implicitly UTC
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class Quiz(BaseCog):
    """Posts PhoenixQuiz results requested by the quiz web app through the shared `bot_events` collection."""

    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'quiz', {
            "database": "phoenixquiz",
            "resultsChannelId": None,
            "quizUrl": None,
        })
        self._task: asyncio.Task | None = None

    @commands.Cog.listener()
    async def on_ready(self):
        # on_ready fires again on every reconnect: only ever run one listener
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())
            self.log(f"Started quiz event listener on database '{self.config.get('database')}'.")

    def cog_unload(self):
        if self._task is not None:
            self._task.cancel()

    def _collection(self) -> AsyncCollection[BotEvent]:
        # The quiz app's database is shared by all guilds, so it bypasses the per-guild Mongo.get_collection
        return self.bot.mongo.client.get_database(self.config.get('database'))['bot_events']

    async def _run(self):
        pipeline = [{'$match': {'operationType': 'insert', 'fullDocument.type': 'post_results'}}]
        delay = RETRY_MIN_SECONDS
        while True:
            try:
                collection = self._collection()
                async with await collection.watch(pipeline) as stream:
                    # Drain once the stream is open, so nothing inserted in between is missed
                    await self._drain_pending(collection)
                    delay = RETRY_MIN_SECONDS
                    async for change in stream:
                        await self._process(collection, change['documentKey']['_id'])
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self.log(f"Event stream dropped ({type(e).__name__}: {e}). Reopening in {delay}s.")
                await asyncio.sleep(delay)
                delay = min(delay * 2, RETRY_MAX_SECONDS)

    async def _drain_pending(self, collection: AsyncCollection[BotEvent]):
        pending = [event['_id'] async for event in collection.find(
            {'type': 'post_results', 'status': 'pending'}, {'_id': 1}).sort('createdAt', 1)]
        if pending:
            self.log(f"Processing {len(pending)} pending quiz event(s).")
        for event_id in pending:
            await self._process(collection, event_id)

    async def _finish(self, collection: AsyncCollection[BotEvent], event_id: ObjectId, status: str, **fields):
        # Filtering on 'pending' guarantees an event is only ever resolved once
        await collection.update_one(
            {'_id': event_id, 'status': 'pending'},
            {'$set': {'status': status, 'processedAt': datetime.now(timezone.utc), **fields}},
        )

    async def _results_channel(self) -> discord.abc.GuildChannel | None:
        try:
            channel_id = int(self.config.get('resultsChannelId'))
        except (TypeError, ValueError):
            return None
        channel = self.bot.get_channel(channel_id)
        if channel is None:
            try:
                channel = await self.bot.fetch_channel(channel_id)
            except discord.HTTPException:
                return None
        if not isinstance(channel, discord.abc.Messageable) or getattr(channel, 'guild', None) is None:
            return None
        return channel

    async def _process(self, collection: AsyncCollection[BotEvent], event_id: ObjectId):
        # Re-read the event: the change stream copy may already have been handled by the drain
        event = await collection.find_one({'_id': event_id, 'status': 'pending'})
        if event is None:
            return

        created_at = _as_utc(event.get('createdAt'))
        if created_at is None:
            self.log(f"Quiz event {event_id} has no createdAt. Marking failed.")
            await self._finish(collection, event_id, 'failed', error="Event has no createdAt")
            return
        if datetime.now(timezone.utc) - created_at > EVENT_MAX_AGE:
            self.log(f"Quiz event {event_id} is older than {EVENT_MAX_AGE}. Marking expired.")
            await self._finish(collection, event_id, 'expired')
            return

        channel = await self._results_channel()
        if channel is None:
            error = f"Results channel {self.config.get('resultsChannelId')} not found or not configured"
            self.log(f"Could not post quiz event {event_id}: {error}.")
            await self._finish(collection, event_id, 'failed', error=error)
            return

        try:
            message = await channel.send(embed=self._build_embed(event['payload'], channel.guild.id))
        except discord.Forbidden:
            error = f"Missing permission to post in #{channel.name}"
        except discord.HTTPException as e:
            error = f"Discord error: {e}"
        except Exception as e:
            # Malformed payload: fail the event rather than retry it forever
            error = f"Invalid event ({type(e).__name__}: {e})"
        else:
            self.log(f"Posted results of '{event['payload']['activityTitle']}' (session {event.get('sessionId')}) "
                     f"requested by {event.get('requestedBy', {}).get('displayName')} in #{channel.name}.", channel.guild)
            await self._finish(collection, event_id, 'posted', messageUrl=message.jump_url)
            return

        self.log(f"Could not post quiz event {event_id}: {error}.", channel.guild)
        await self._finish(collection, event_id, 'failed', error=error)

    def _build_embed(self, results: QuizResults, guild_id: int) -> discord.Embed:
        quiz_url = self.config.get('quizUrl')
        top = sorted(results.get('top') or [], key=lambda p: p['rank'])[:10]

        def line(player: QuizPlayer) -> str:
            name = discord.utils.escape_markdown(str(player['displayName'])[:64])
            score = self.bot.t('quiz.score', guild_id, score=player['score'])
            medal = MEDALS.get(player['rank'])
            return f"{medal} **{name}** — {score}" if medal else f"`#{player['rank']}` {name} — {score}"

        podium = [line(p) for p in top if p['rank'] in MEDALS]
        others = [line(p) for p in top if p['rank'] not in MEDALS]

        description = "\n".join(podium) if podium else self.bot.t('quiz.no_players', guild_id)
        if quiz_url:
            description += f"\n\n[{self.bot.t('quiz.play_link', guild_id)}]({quiz_url})"

        embed = discord.Embed(
            title=str(results['activityTitle'])[:256],
            url=quiz_url or None,
            description=description,
            color=discord.Color.gold(),
            timestamp=_as_utc(results.get('endedAt')),
        )
        embed.set_author(name=self.bot.t('quiz.results_author', guild_id))
        if top and str(top[0].get('avatarUrl') or '').startswith(('http://', 'https://')):
            embed.set_thumbnail(url=top[0]['avatarUrl'])
        if others:
            embed.add_field(name=self.bot.t('quiz.leaderboard', guild_id), value="\n".join(others), inline=False)
        embed.add_field(name=self.bot.t('quiz.players', guild_id), value=str(results.get('playerCount', len(top))))
        embed.set_footer(text=self.bot.t('quiz.ended', guild_id))
        return embed


def setup(bot):
    bot.add_cog(Quiz(bot))
