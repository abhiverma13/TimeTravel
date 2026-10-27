package com.example.cpen321application.data

/** Request and response bodies of the Group Service endpoints. */

const val ROLE_OWNER = "owner"

data class GroupMember(
    val userId: String,
    val name: String,
    /** "owner" or "member". */
    val role: String,
    val interests: List<String>,
    val vetoedActivityIds: List<String>,
)

data class Group(
    val id: String,
    val name: String,
    /** Six characters; friends type it to join. */
    val inviteCode: String,
    /** The signed-in traveller's role in this group. */
    val myRole: String,
    val members: List<GroupMember>,
    val createdAt: String,
) {
    val isOwner: Boolean
        get() = myRole == ROLE_OWNER
}

data class GroupSummary(val id: String, val name: String, val memberCount: Int, val myRole: String, val createdAt: String)

data class GroupsResponse(val groups: List<GroupSummary>)

data class CreateGroupRequest(val name: String)

data class JoinGroupRequest(val inviteCode: String)

/** Null fields are left out of the request, so they stay as they are. */
data class GroupPreferencesRequest(val interests: List<String>? = null, val vetoedActivityIds: List<String>? = null)
