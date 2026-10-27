package com.example.cpen321application.data

import com.google.gson.Gson
import com.google.gson.JsonParseException
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import java.net.URI
import org.json.JSONObject

/** Whether live updates for the itinerary on screen are arriving. */
enum class LiveStatus { CONNECTING, LIVE, OFFLINE }

/** An open live connection for one itinerary. */
class LiveItinerary internal constructor(private val socket: Socket) {
    fun close() {
        socket.off()
        socket.disconnect()
    }
}

private const val ITINERARY_UPDATED = "itineraryUpdated"

/**
 * Live itinerary updates from the Trip Sync & Disruption Service, over Socket.io on the API's own address and with the
 * same session token. Reconnects by itself and re-subscribes each time it does.
 */
class LiveItineraryClient(private val baseUrl: String, private val sessionStore: SessionStore) {
    private val gson = Gson()

    /** Subscribes to one itinerary. Both callbacks run on a background thread. */
    fun open(itineraryId: String, onStatus: (LiveStatus) -> Unit, onChange: (ItineraryChange) -> Unit): LiveItinerary {
        val options = IO.Options.builder()
            .setAuth(mapOf("token" to sessionStore.token.orEmpty()))
            .setTransports(arrayOf(WebSocket.NAME))
            .build()
        val socket = IO.socket(URI.create(baseUrl), options)
        socket.on(Socket.EVENT_CONNECT) {
            val subscription = JSONObject().put("itineraryId", itineraryId)
            socket.emit("subscribe", subscription, Ack { replies ->
                val accepted = (replies.firstOrNull() as? JSONObject)?.optBoolean("ok") == true
                onStatus(if (accepted) LiveStatus.LIVE else LiveStatus.OFFLINE)
            })
        }
        socket.on(Socket.EVENT_DISCONNECT) { onStatus(LiveStatus.OFFLINE) }
        socket.on(Socket.EVENT_CONNECT_ERROR) { onStatus(LiveStatus.OFFLINE) }
        socket.on(ITINERARY_UPDATED) { args -> parseChange(args.firstOrNull())?.let(onChange) }
        onStatus(LiveStatus.CONNECTING)
        socket.connect()
        return LiveItinerary(socket)
    }

    private fun parseChange(payload: Any?): ItineraryChange? {
        val json = (payload as? JSONObject)?.toString() ?: return null
        return try {
            gson.fromJson(json, ItineraryChange::class.java)
        } catch (expected: JsonParseException) {
            null
        }
    }
}
