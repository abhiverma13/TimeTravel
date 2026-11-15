package com.example.cpen321application.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** The parts of the app a notification belongs to; each tab shows a red dot while its part has unread ones. */
object NotificationAreas {
    const val TRIPS = "trips"
    const val GROUPS = "groups"
    const val FEED = "feed"
    const val PROFILE = "profile"
}

/** A live event kept for the traveller, unread until they open the part of the app it belongs to. */
data class AppNotification(
    val id: String,
    val type: String,
    val area: String,
    val text: String,
    val actorId: String,
    val groupId: String?,
    val tripId: String?,
    val postId: String?,
    val read: Boolean,
    val at: String,
)

data class NotificationList(val notifications: List<AppNotification>, val unread: Map<String, Int>)

data class UnreadCounts(val unread: Map<String, Int>)

data class MarkReadBody(val area: String?)

/** Retrofit description of the Notification Service endpoints. */
interface NotificationApi {
    @GET("api/notifications")
    suspend fun notifications(): NotificationList

    @POST("api/notifications/read")
    suspend fun markRead(@Body body: MarkReadBody): UnreadCounts
}

/** The traveller's notifications and unread counts, for the red dots. */
class NotificationRepository(private val api: NotificationApi) {
    suspend fun notifications(): Result<NotificationList> = apiCall { api.notifications() }

    /** Marks one area's notifications read; returns the unread counts left. */
    suspend fun markRead(area: String): Result<Map<String, Int>> = apiCall { api.markRead(MarkReadBody(area)) }.map { it.unread }
}
