package com.example.cpen321application.data

import android.app.Activity

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_NOT_FOUND = 404

/** The app's single entry point to the back-end and the stored session. */
class TimeTravelRepository(
    private val api: TimeTravelApi,
    private val sessionStore: SessionStore,
    private val googleSignIn: GoogleSignInClient,
) {
    val isSignInConfigured: Boolean
        get() = googleSignIn.isConfigured

    /** Google sign-in, then exchange of the Google ID token for a TimeTravel session. */
    suspend fun signIn(activity: Activity): Result<UserProfile> {
        val idToken = try {
            googleSignIn.requestIdToken(activity)
        } catch (error: SignInException) {
            return Result.failure(error)
        }
        return apiCall { api.signInWithGoogle(GoogleSignInRequest(idToken)) }.map { response ->
            sessionStore.save(response.token)
            response.user
        }
    }

    /** The traveller of the stored session, or null when there is none or it has expired. */
    suspend fun restoreSession(): Result<UserProfile?> {
        if (sessionStore.token == null) {
            return Result.success(null)
        }
        val result: Result<UserProfile?> = apiCall { api.currentUser() }
        val error = result.exceptionOrNull()
        val sessionRejected = error is ApiException && (error.status == HTTP_UNAUTHORIZED || error.status == HTTP_NOT_FOUND)
        if (sessionRejected) {
            sessionStore.clear()
        }
        return if (sessionRejected) Result.success(null) else result
    }

    fun signOut() {
        sessionStore.clear()
    }

    /** Saves the traveller's home city and interest tags. */
    suspend fun updateProfile(homeCity: String, interests: List<String>): Result<UserProfile> =
        apiCall { api.updateProfile(ProfileUpdateRequest(homeCity.trim(), interests)) }

    /** A city's activities, best community score first; `interest` narrows them to one tag. */
    suspend fun activities(city: String, interest: String?): Result<List<TravelActivity>> =
        apiCall { api.activities(city, interest) }.map { response -> response.activities }

    /** Saves the traveller's rating and tags, returning the activity with its updated community score. */
    suspend fun reviewActivity(activityId: String, rating: Int, comment: String, tags: ReviewTags): Result<TravelActivity> =
        apiCall { api.reviewActivity(activityId, ReviewRequest(rating, comment, tags)) }.map { response -> response.activity }

    /** Asks the Itinerary Engine for a day-by-day plan; the plan is stored and returned. */
    suspend fun generateItinerary(request: GenerateItineraryRequest): Result<Itinerary> =
        apiCall { api.generateItinerary(request) }

    /** The traveller's most recent personal and group itineraries, newest first; only one group's with `groupId`. */
    suspend fun recentItineraries(groupId: String? = null): Result<List<ItinerarySummary>> =
        apiCall { api.itineraries(groupId) }.map { response -> response.itineraries }

    suspend fun itinerary(itineraryId: String): Result<Itinerary> = apiCall { api.itinerary(itineraryId) }

    /** View & Adjust Itinerary: locks, unlocks, removes or moves a stop, or re-plans a day; returns the new plan. */
    suspend fun adjustItinerary(itineraryId: String, request: AdjustRequest): Result<Itinerary> =
        apiCall { api.adjustItinerary(itineraryId, request) }
}
