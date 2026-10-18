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

/** A trip for the Itinerary Engine. Times are HH:MM; null optional fields are left out of the request. */
data class GenerateItineraryRequest(
    val city: String,
    val startDate: String,
    val endDate: String,
    val dayStart: String,
    val dayEnd: String,
    val arrivalTime: String?,
    val departureTime: String?,
    val interests: List<String>,
    val pace: String,
    val lodging: String?,
)

/** Where each day starts and ends; source is "places" or "city-centre". */
data class Lodging(val label: String, val lat: Double, val lng: Double, val source: String)

data class ItineraryStop(
    val activityId: String,
    val name: String,
    val address: String,
    val location: GeoPoint,
    val interests: List<String>,
    val startTime: String,
    val endTime: String,
    /** Travel from the previous stop, or from the lodging for the first stop. */
    val travelMinutes: Int,
    val communityScore: Double,
)

data class ItineraryDay(val date: String, val weekday: Int, val stops: List<ItineraryStop>, val returnTravelMinutes: Int)

data class Itinerary(
    val id: String,
    val city: String,
    val startDate: String,
    val endDate: String,
    val dayStart: String,
    val dayEnd: String,
    val arrivalTime: String?,
    val departureTime: String?,
    val interests: List<String>,
    val pace: String,
    val lodging: Lodging,
    val days: List<ItineraryDay>,
    val candidateCount: Int,
    val unscheduledCount: Int,
    val warnings: List<String>,
    val generationMs: Int,
    val createdAt: String,
)

data class ItinerarySummary(
    val id: String,
    val city: String,
    val startDate: String,
    val endDate: String,
    val pace: String,
    val stopCount: Int,
    val createdAt: String,
)

data class ItinerariesResponse(val itineraries: List<ItinerarySummary>)
