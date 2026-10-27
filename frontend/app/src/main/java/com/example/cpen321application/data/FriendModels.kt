package com.example.cpen321application.data

/** How a traveller relates to the signed-in one. */
const val FRIENDSHIP_SELF = "self"
const val FRIENDSHIP_NONE = "none"
const val FRIENDSHIP_REQUESTED = "requested"
const val FRIENDSHIP_INCOMING = "incoming"
const val FRIENDSHIP_FRIENDS = "friends"

/** Another traveller as the signed-in one sees them. */
data class Traveller(
    val id: String,
    val name: String,
    /** Empty for a private account you are not friends with. */
    val homeCity: String,
    val isPrivate: Boolean,
    /** self, none, requested (you asked), incoming (they asked) or friends. */
    val friendship: String,
    /** Only sent when one traveller is fetched on their own. */
    val friendCount: Int = 0,
)

data class TravellersResponse(val travellers: List<Traveller>)

/** The signed-in traveller's friends, the requests they received and sent, and their privacy setting. */
data class FriendLists(
    val isPrivate: Boolean,
    val friends: List<Traveller>,
    val incoming: List<Traveller>,
    val outgoing: List<Traveller>,
)

data class FriendRequestBody(val userId: String)

data class PrivacySetting(val isPrivate: Boolean)
