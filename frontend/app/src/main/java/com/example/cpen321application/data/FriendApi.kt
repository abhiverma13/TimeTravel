package com.example.cpen321application.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Retrofit description of the Friend Service endpoints. */
interface FriendApi {
    @GET("api/travellers")
    suspend fun searchTravellers(@Query("search") search: String): TravellersResponse

    @GET("api/travellers/{userId}")
    suspend fun traveller(@Path("userId") userId: String): Traveller

    @GET("api/friends")
    suspend fun friends(): FriendLists

    @POST("api/friends/requests")
    suspend fun sendRequest(@Body body: FriendRequestBody): Traveller

    @POST("api/friends/requests/{userId}/accept")
    suspend fun acceptRequest(@Path("userId") userId: String): Traveller

    @DELETE("api/friends/{userId}")
    suspend fun removeFriendship(@Path("userId") userId: String)

    @PUT("api/friends/privacy")
    suspend fun setPrivacy(@Body body: PrivacySetting): PrivacySetting
}
