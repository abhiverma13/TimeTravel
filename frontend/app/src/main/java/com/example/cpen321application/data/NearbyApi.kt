package com.example.cpen321application.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Retrofit description of the Nearby Service endpoints. */
interface NearbyApi {
    @GET("api/nearby/trips")
    suspend fun trips(@Query("lat") lat: Double, @Query("lng") lng: Double): NearbyTripsResponse

    @PUT("api/nearby/trips/{tripId}")
    suspend fun setOpen(@Path("tripId") tripId: String, @Body body: OpenToJoinBody): OpenToJoinBody

    @POST("api/nearby/trips/{tripId}/requests")
    suspend fun requestToJoin(@Path("tripId") tripId: String, @Body body: JoinRequestBody): JoinRequest

    @GET("api/nearby/requests")
    suspend fun requests(@Query("groupId") groupId: String): JoinRequestsResponse

    @POST("api/nearby/requests/{requestId}/accept")
    suspend fun accept(@Path("requestId") requestId: String): JoinRequest

    @POST("api/nearby/requests/{requestId}/decline")
    suspend fun decline(@Path("requestId") requestId: String): JoinRequest
}
