package com.example.cpen321application.data

/** Travel groups: creating, joining and leaving them, and each member's preferences for group trips. */
class GroupRepository(private val api: GroupApi) {
    /** The traveller's groups, newest first. */
    suspend fun groups(): Result<List<GroupSummary>> = apiCall { api.groups() }.map { response -> response.groups }

    suspend fun group(groupId: String): Result<Group> = apiCall { api.group(groupId) }

    suspend fun createGroup(name: String): Result<Group> = apiCall { api.createGroup(CreateGroupRequest(name.trim())) }

    /** Joins with a friend's invite code; case and surrounding spaces do not matter. */
    suspend fun joinGroup(inviteCode: String): Result<Group> =
        apiCall { api.joinGroup(JoinGroupRequest(inviteCode.trim().uppercase())) }

    /** The interests the Itinerary Engine uses for this traveller in this group's trips. */
    suspend fun setInterests(groupId: String, interests: List<String>): Result<Group> =
        apiCall { api.updatePreferences(groupId, GroupPreferencesRequest(interests = interests)) }

    suspend fun setVetoes(groupId: String, activityIds: List<String>): Result<Group> =
        apiCall { api.updatePreferences(groupId, GroupPreferencesRequest(vetoedActivityIds = activityIds)) }

    /** Adds one activity to the traveller's vetoes, so this group's next plans leave it out. */
    suspend fun veto(groupId: String, myUserId: String, activityId: String): Result<Group> {
        val group = group(groupId).getOrElse { error -> return Result.failure(error) }
        val current = group.members.firstOrNull { it.userId == myUserId }?.vetoedActivityIds.orEmpty()
        return setVetoes(groupId, (current + activityId).distinct())
    }

    /** The owner removes a member, or a traveller passes their own id to leave. */
    suspend fun removeMember(groupId: String, userId: String): Result<Unit> = apiCall { api.removeMember(groupId, userId) }

    suspend fun deleteGroup(groupId: String): Result<Unit> = apiCall { api.deleteGroup(groupId) }
}
