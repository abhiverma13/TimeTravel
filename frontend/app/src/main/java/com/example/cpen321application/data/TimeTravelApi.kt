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
    suspend fun suggestions(@Query("itineraryId") itineraryId: String): SuggestionsResponse

    @POST("api/suggestions/{suggestionId}/accept")
    suspend fun acceptSuggestion(@Path("suggestionId") suggestionId: String): Itinerary

    @POST("api/suggestions/{suggestionId}/dismiss")
    suspend fun dismissSuggestion(@Path("suggestionId") suggestionId: String)

    @GET("api/activities/{activityId}/reviews")
    suspend fun reviews(@Path("activityId") activityId: String): ReviewsResponse

    @POST("api/itineraries/generate")
    suspend fun generateItinerary(@Body body: GenerateItineraryRequest): Itinerary

    /** All the traveller's itineraries, or only one group's when `groupId` is set. */
    @GET("api/itineraries")
    suspend fun itineraries(@Query("groupId") groupId: String?): ItinerariesResponse

    @GET("api/itineraries/{itineraryId}")
    suspend fun itinerary(@Path("itineraryId") itineraryId: String): Itinerary

    @POST("api/itineraries/{itineraryId}/adjust")
    suspend fun adjustItinerary(@Path("itineraryId") itineraryId: String, @Body body: AdjustRequest): Itinerary
}
