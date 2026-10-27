package com.example.cpen321application.data

/** Group trips opened to travellers nearby, and requests to join their groups. */
class NearbyRepository(private val api: NearbyApi) {
    /** Open trips with a stop within 10 km of this position, starting within a week, nearest first. */
    suspend fun trips(position: GeoPoint): Result<List<NearbyTrip>> = apiCall { api.trips(position.lat, position.lng) }.map { it.trips }

    /** The group's owner opens a trip to travellers nearby, or closes it. */
    suspend fun setOpen(itineraryId: String, open: Boolean): Result<Boolean> =
        apiCall { api.setOpen(itineraryId, OpenToJoinBody(open)) }.map { it.openToJoin }

    suspend fun askToJoin(itineraryId: String, note: String): Result<JoinRequest> = apiCall { api.requestToJoin(itineraryId, JoinRequestBody(note.trim())) }

    /** The group's pending requests; only its owner may see them. */
    suspend fun requests(groupId: String): Result<List<JoinRequest>> = apiCall { api.requests(groupId) }.map { it.requests }

    suspend fun answer(requestId: String, accept: Boolean): Result<JoinRequest> = apiCall { if (accept) api.accept(requestId) else api.decline(requestId) }
}
