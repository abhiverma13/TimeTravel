package com.example.cpen321application.data

import com.google.gson.Gson
import com.google.gson.JsonParseException
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import java.net.URI
import org.json.JSONObject

/** Whether live updates for the trip on screen are arriving. */
enum class LiveStatus { CONNECTING, LIVE, OFFLINE }

/** Where a member of the trip is, as their device last reported it. */
data class MemberLocation(val tripId: String, val userId: String, val name: String, val lat: Double, val lng: Double, val at: String)

/** An open live connection for one trip. */
class LiveTrip internal constructor(private val socket: Socket, private val tripId: String) {
    /** Sends this device's position to the trip's other members; it is passed on, never stored. */
    fun shareLocation(lat: Double, lng: Double) {
        socket.emit("shareLocation", JSONObject().put("tripId", tripId).put("lat", lat).put("lng", lng))
    }

    fun stopSharingLocation() {
        socket.emit("stopSharingLocation", JSONObject().put("tripId", tripId))
    }

    fun close() {
        socket.off()
        socket.disconnect()
    }
}

private const val TRIP_UPDATED = "tripUpdated"
private const val MEMBER_LOCATION = "memberLocation"
private const val MEMBER_LOCATION_STOPPED = "memberLocationStopped"
private const val SUGGESTION_ADDED = "suggestionAdded"
private const val TRIP_ACCESS_LOST = "tripAccessLost"

/**
 * Live trip updates from the Trip Sync & Disruption Service, over Socket.io on the API's own address and with the
 * same session token. Reconnects by itself and re-subscribes each time it does.
 */
class LiveTripClient(private val baseUrl: String, private val sessionStore: SessionStore) {
    private val gson = Gson()

    /**
     * Subscribes to one trip. Every callback runs on a background thread; the member callbacks report other members'
     * shared positions, and their user id when they stop sharing; `onSuggestion` gets new disruption suggestions;
     * `onAccessLost` runs when the traveller leaves the trip's group, is removed, or the group is deleted.
     */
    fun open(
        tripId: String,
        onStatus: (LiveStatus) -> Unit,
        onChange: (TripChange) -> Unit,
        onMemberLocation: (MemberLocation) -> Unit = {},
        onMemberGone: (String) -> Unit = {},
        onSuggestion: (Suggestion) -> Unit = {},
        onAccessLost: () -> Unit = {},
    ): LiveTrip {
        val options = IO.Options.builder()
            .setAuth(mapOf("token" to sessionStore.token.orEmpty()))
            .setTransports(arrayOf(WebSocket.NAME))
            .build()
        val socket = IO.socket(URI.create(baseUrl), options)
        socket.on(Socket.EVENT_CONNECT) {
            val subscription = JSONObject().put("tripId", tripId)
            socket.emit("subscribe", subscription, Ack { replies ->
                val accepted = (replies.firstOrNull() as? JSONObject)?.optBoolean("ok") == true
                onStatus(if (accepted) LiveStatus.LIVE else LiveStatus.OFFLINE)
            })
        }
        socket.on(Socket.EVENT_DISCONNECT) { onStatus(LiveStatus.OFFLINE) }
        socket.on(Socket.EVENT_CONNECT_ERROR) { onStatus(LiveStatus.OFFLINE) }
        socket.on(TRIP_UPDATED) { args -> parse(args.firstOrNull(), TripChange::class.java)?.let(onChange) }
        socket.on(MEMBER_LOCATION) { args -> parse(args.firstOrNull(), MemberLocation::class.java)?.let(onMemberLocation) }
        socket.on(MEMBER_LOCATION_STOPPED) { args -> (args.firstOrNull() as? JSONObject)?.optString("userId")?.let(onMemberGone) }
        socket.on(SUGGESTION_ADDED) { args -> parse(args.firstOrNull(), Suggestion::class.java)?.let(onSuggestion) }
        socket.on(TRIP_ACCESS_LOST) { onAccessLost() }
        onStatus(LiveStatus.CONNECTING)
        socket.connect()
        return LiveTrip(socket, tripId)
    }

    private fun <T> parse(payload: Any?, type: Class<T>): T? {
        val json = (payload as? JSONObject)?.toString() ?: return null
        return try {
            gson.fromJson(json, type)
        } catch (expected: JsonParseException) {
            null
        }
    }
}
