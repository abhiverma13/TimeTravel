package com.example.cpen321application.data

/** Friends: finding travellers, friend requests, and whether the traveller's account is private. */
class FriendRepository(private val api: FriendApi) {
    /** Travellers whose name contains the text, or whose email is exactly it. */
    suspend fun search(text: String): Result<List<Traveller>> =
        apiCall { api.searchTravellers(text.trim()) }.map { response -> response.travellers }

    /** One traveller, with how many friends they have. */
    suspend fun traveller(userId: String): Result<Traveller> = apiCall { api.traveller(userId) }

    suspend fun friends(): Result<FriendLists> = apiCall { api.friends() }

    /** Sends a friend request, or accepts theirs if they already asked. */
    suspend fun addFriend(userId: String): Result<Traveller> = apiCall { api.sendRequest(FriendRequestBody(userId)) }

    suspend fun accept(userId: String): Result<Traveller> = apiCall { api.acceptRequest(userId) }

    /** Unfriends the traveller, cancels a request sent to them, or declines one from them. */
    suspend fun remove(userId: String): Result<Unit> = apiCall { api.removeFriendship(userId) }

    suspend fun setPrivate(isPrivate: Boolean): Result<Boolean> =
        apiCall { api.setPrivacy(PrivacySetting(isPrivate)) }.map { setting -> setting.isPrivate }
}
