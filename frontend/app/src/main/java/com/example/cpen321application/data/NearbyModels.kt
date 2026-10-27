package com.example.cpen321application.data

const val REQUEST_NONE = "none"
const val REQUEST_PENDING = "pending"
const val REQUEST_DECLINED = "declined"

/** An open group trip near the traveller. It never says where the group sleeps or where its members are. */
data class NearbyTrip(
    val itineraryId: String,
    val groupId: String,
    val groupName: String,
    val organizer: String,
    val memberCount: Int,
    val city: String,
    val startDate: String,
    val endDate: String,
    val stopNames: List<String>,
    val interests: List<String>,
    val distanceKm: Double,
    /** none, pending, accepted or declined: the traveller's latest request to join. */
    val myRequest: String,
)

data class NearbyTripsResponse(val trips: List<NearbyTrip>)

data class OpenToJoinBody(val openToJoin: Boolean)

data class JoinRequestBody(val note: String)

data class JoinRequester(val id: String, val name: String)

/** A traveller asking to join a group through one of its open trips. */
data class JoinRequest(
    val id: String,
    val itineraryId: String,
    val groupId: String,
    val requester: JoinRequester,
    val note: String,
    val status: String,
    val createdAt: String,
)

data class JoinRequestsResponse(val requests: List<JoinRequest>)
