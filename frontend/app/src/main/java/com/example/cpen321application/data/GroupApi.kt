package com.example.cpen321application.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/** Retrofit description of the Group Service endpoints. */
interface GroupApi {
    @POST("api/groups")
    suspend fun createGroup(@Body body: CreateGroupRequest): Group

    @GET("api/groups")
    suspend fun groups(): GroupsResponse

    @POST("api/groups/join")
    suspend fun joinGroup(@Body body: JoinGroupRequest): Group

    @GET("api/groups/{groupId}")
    suspend fun group(@Path("groupId") groupId: String): Group

    @PUT("api/groups/{groupId}/members/me")
    suspend fun updatePreferences(@Path("groupId") groupId: String, @Body body: GroupPreferencesRequest): Group

    @DELETE("api/groups/{groupId}/members/{userId}")
    suspend fun removeMember(@Path("groupId") groupId: String, @Path("userId") userId: String)

    @DELETE("api/groups/{groupId}")
    suspend fun deleteGroup(@Path("groupId") groupId: String)
}
