package com.example.cpen321application.data

/** Request and response bodies of the TimeTravel back-end REST API. */

data class GoogleSignInRequest(val idToken: String)

data class UserProfile(
    val id: String,
    val email: String,
    val name: String,
    /** Prefills Explore and the Trip Builder; empty until the traveller sets it. */
    val homeCity: String,
    val interests: List<String>,
)

data class ProfileUpdateRequest(val homeCity: String, val interests: List<String>)

data class SignInResponse(val token: String, val user: UserProfile)

/** The JSON body the back-end sends with every 4xx/5xx response. */
data class ErrorResponse(val error: String?, val details: List<String>?)

data class GeoPoint(val lat: Double, val lng: Double)

/** An opening window on a weekday (0 = Sunday), in minutes after local midnight. */
data class OpeningPeriod(val day: Int, val openMinute: Int, val closeMinute: Int)

/** The most-reported structured tags for an activity; each is null until a traveller reports it. */
data class CommunityTags(val bestTimeOfDay: String?, val cost: String?, val setting: String?)

/** An activity in a city's catalogue ("Activity" alone would clash with android.app.Activity). */
data class TravelActivity(
    val id: String,
    val name: String,
    val address: String,
    val location: GeoPoint,
    val interests: List<String>,
    val durationMinutes: Int,
    val communityTags: CommunityTags?,
    val googleRating: Double?,
    val googleRatingCount: Int,
    val reviewCount: Int,
    val communityScore: Double,
    /** null when the opening hours are unknown. */
    val openingHours: List<OpeningPeriod>?,
)

data class ActivitiesResponse(val city: String, val activities: List<TravelActivity>)

/** Optional structured tags a traveller attaches to a rating; null fields are left out of the request. */
data class ReviewTags(
    val durationMinutes: Int? = null,
    val bestTimeOfDay: String? = null,
    val cost: String? = null,
    val setting: String? = null,
)

data class ReviewRequest(val rating: Int, val comment: String, val tags: ReviewTags)

data class Review(val id: String, val activityId: String, val rating: Int, val comment: String, val updatedAt: String)

data class ReviewResponse(val review: Review, val activity: TravelActivity)
