package com.example.cpen321application.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Retrofit description of the back-end endpoints the app calls. */
interface TimeTravelApi {
    @POST("api/auth/google")
    suspend fun signInWithGoogle(@Body body: GoogleSignInRequest): SignInResponse

    @GET("api/users/me")
    suspend fun currentUser(): UserProfile

    @PUT("api/users/me")
    suspend fun updateProfile(@Body body: ProfileUpdateRequest): UserProfile

    @GET("api/activities")
    suspend fun activities(@Query("city") city: String, @Query("interest") interest: String?): ActivitiesResponse

    @POST("api/activities/{activityId}/reviews")
    suspend fun reviewActivity(@Path("activityId") activityId: String, @Body body: ReviewRequest): ReviewResponse

    @GET("api/suggestions")
    suspend fun suggestions(@Query("tripId") tripId: String): SuggestionsResponse

    @POST("api/suggestions/{suggestionId}/accept")
    suspend fun acceptSuggestion(@Path("suggestionId") suggestionId: String): Trip

    @POST("api/suggestions/{suggestionId}/dismiss")
    suspend fun dismissSuggestion(@Path("suggestionId") suggestionId: String)

    @GET("api/activities/{activityId}/reviews")
    suspend fun reviews(@Path("activityId") activityId: String): ReviewsResponse

    @POST("api/trips/generate")
    suspend fun generateTrip(@Body body: GenerateTripRequest): Trip

    /** All the traveller's trips, or only one group's when `groupId` is set. */
    @GET("api/trips")
    suspend fun trips(@Query("groupId") groupId: String?): TripsResponse

    @GET("api/trips/{tripId}")
    suspend fun trip(@Path("tripId") tripId: String): Trip

    @POST("api/trips/{tripId}/adjust")
    suspend fun adjustTrip(@Path("tripId") tripId: String, @Body body: AdjustRequest): Trip
}
