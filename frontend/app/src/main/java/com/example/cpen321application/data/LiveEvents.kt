package com.example.cpen321application.data

import com.google.gson.Gson
import com.google.gson.JsonParseException
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import java.net.URI
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.json.JSONObject

/** Something another traveller (or the disruption timer) did that concerns you, pushed live: "Ava joined Crew". */
data class LiveEvent(
    val type: String,
    val text: String,
    val actorId: String,
    val groupId: String? = null,
    val tripId: String? = null,
    val postId: String? = null,
    val at: String,
)

/** The kinds of [LiveEvent], as the back-end names them. */
object LiveEventTypes {
    const val FRIEND_REQUEST = "friendRequest"
    const val FRIEND_ACCEPTED = "friendAccepted"
    const val FRIEND_REMOVED = "friendRemoved"
    const val MEMBER_JOINED = "memberJoined"
    const val MEMBER_LEFT = "memberLeft"
    const val REMOVED_FROM_GROUP = "removedFromGroup"
    const val GROUP_DELETED = "groupDeleted"
    const val JOIN_REQUEST = "joinRequest"
    const val JOIN_ANSWERED = "joinAnswered"
    const val POST_LIKED = "postLiked"
    const val POST_COMMENTED = "postCommented"
    const val SUGGESTION = "suggestion"

    val FRIENDS = setOf(FRIEND_REQUEST, FRIEND_ACCEPTED, FRIEND_REMOVED)
    val GROUPS = setOf(MEMBER_JOINED, MEMBER_LEFT, REMOVED_FROM_GROUP, GROUP_DELETED)
    val POSTS = setOf(POST_LIKED, POST_COMMENTED)
}

private const val LIVE_EVENT = "liveEvent"
private const val EVENT_BUFFER = 32

/**
 * The signed-in traveller's live events, over one Socket.io connection kept open while they are signed in. Socket.io
 * reconnects by itself; the server puts every connection of the traveller in their own room.
 */
class LiveEventStream(private val baseUrl: String, private val sessionStore: SessionStore) {
    private val gson = Gson()
    private val mutableEvents = MutableSharedFlow<LiveEvent>(extraBufferCapacity = EVENT_BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private var socket: Socket? = null

    val events: SharedFlow<LiveEvent> = mutableEvents.asSharedFlow()

    /** Connects with the current session, unless already connected. */
    fun start() {
        if (socket != null) {
            return
        }
        val options = IO.Options.builder()
            .setAuth(mapOf("token" to sessionStore.token.orEmpty()))
            .setTransports(arrayOf(WebSocket.NAME))
            .build()
        val connection = IO.socket(URI.create(baseUrl), options)
        connection.on(LIVE_EVENT) { args -> parse(args.firstOrNull())?.let(mutableEvents::tryEmit) }
        connection.connect()
        socket = connection
    }

    /** Disconnects, as when the traveller signs out. */
    fun stop() {
        socket?.off()
        socket?.disconnect()
        socket = null
    }

    private fun parse(payload: Any?): LiveEvent? {
        val json = (payload as? JSONObject)?.toString() ?: return null
        return try {
            gson.fromJson(json, LiveEvent::class.java)
        } catch (expected: JsonParseException) {
            null
        }
    }
}
