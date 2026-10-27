package com.example.cpen321application.ui.explore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.AdjustRequest
import com.example.cpen321application.data.Itinerary
import com.example.cpen321application.data.ItinerarySummary
import com.example.cpen321application.data.ReviewTags
import com.example.cpen321application.data.TimeTravelRepository
import com.example.cpen321application.data.TravelActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Adding one place to a trip: first the trip, then the day. */
data class AddToTripState(
    val activity: TravelActivity,
    val loading: Boolean = true,
    /** The traveller's trips to the city being explored. */
    val trips: List<ItinerarySummary> = emptyList(),
    /** The chosen trip, once picked. */
    val trip: Itinerary? = null,
    val error: String? = null,
)

data class ExploreUiState(
    val city: String,
    /** Interest tag filter, or null for all activities. */
    val interest: String? = null,
    val loading: Boolean = false,
    /** The city of the results on screen, or null before the first search. */
    val searchedCity: String? = null,
    val activities: List<TravelActivity> = emptyList(),
    val error: String? = null,
    /** The activity whose rating dialog is open. */
    val rating: TravelActivity? = null,
    val submittingReview: Boolean = false,
    val reviewError: String? = null,
    /** A one-time confirmation for the snackbar. */
    val confirmation: String? = null,
    /** The add-to-trip dialog, while it is open. */
    val adding: AddToTripState? = null,
)

/** Explore & review: search a city's activities, filter by interest, and rate and tag them. */
class ExploreViewModel(private val repository: TimeTravelRepository, initialCity: String) : ViewModel() {
    private val mutableState = MutableStateFlow(ExploreUiState(city = initialCity))
    val state: StateFlow<ExploreUiState> = mutableState.asStateFlow()

    fun onCityChange(city: String) {
        mutableState.update { it.copy(city = city) }
    }

    fun onInterestSelected(interest: String?) {
        mutableState.update { it.copy(interest = interest) }
        if (state.value.searchedCity != null) {
            search()
        }
    }

    fun search() {
        val city = state.value.city.trim()
        if (city.isEmpty()) {
            mutableState.update { it.copy(error = "Enter a city to explore.") }
            return
        }
        mutableState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            repository.activities(city, state.value.interest).fold(
                onSuccess = { activities ->
                    mutableState.update { it.copy(loading = false, searchedCity = city, activities = activities) }
                },
                onFailure = { error ->
                    mutableState.update { it.copy(loading = false, error = error.message, activities = emptyList()) }
                },
            )
        }
    }

    fun startRating(activity: TravelActivity) {
        mutableState.update { it.copy(rating = activity, reviewError = null) }
    }

    fun dismissRating() {
        mutableState.update { it.copy(rating = null, reviewError = null) }
    }

    fun submitReview(rating: Int, comment: String, tags: ReviewTags) {
        val activity = state.value.rating ?: return
        mutableState.update { it.copy(submittingReview = true, reviewError = null) }
        viewModelScope.launch {
            repository.reviewActivity(activity.id, rating, comment.trim(), tags).fold(
                onSuccess = { updated ->
                    mutableState.update { current ->
                        current.copy(
                            submittingReview = false,
                            rating = null,
                            activities = current.activities.map { if (it.id == updated.id) updated else it },
                            confirmation = "Thanks! Your review of ${updated.name} was saved.",
                        )
                    }
                },
                onFailure = { error ->
                    mutableState.update { it.copy(submittingReview = false, reviewError = error.message) }
                },
            )
        }
    }

    fun confirmationShown() {
        mutableState.update { it.copy(confirmation = null) }
    }

    /** Add a Specific Place: lists the traveller's trips to this city. */
    fun startAddToTrip(activity: TravelActivity) {
        val city = state.value.searchedCity.orEmpty()
        mutableState.update { it.copy(adding = AddToTripState(activity)) }
        viewModelScope.launch {
            val result = repository.recentItineraries()
            updateAdding { adding ->
                result.fold(
                    onSuccess = { trips -> adding.copy(loading = false, trips = trips.filter { it.city.equals(city, ignoreCase = true) }) },
                    onFailure = { error -> adding.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun chooseTrip(trip: ItinerarySummary) {
        updateAdding { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val result = repository.itinerary(trip.id)
            updateAdding { adding ->
                result.fold(
                    onSuccess = { itinerary -> adding.copy(loading = false, trip = itinerary) },
                    onFailure = { error -> adding.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    /**
     * Adds the place to that day where it costs the least extra travel, dropping the lowest-ranked unlocked stops if the
     * day is full; the trip's members see it live.
     */
    fun addToDay(dayIndex: Int) {
        val adding = state.value.adding ?: return
        val trip = adding.trip ?: return
        updateAdding { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            repository.adjustItinerary(trip.id, AdjustRequest("add", trip.version, dayIndex, adding.activity.id)).fold(
                onSuccess = { updated ->
                    mutableState.update { it.copy(adding = null, confirmation = addedText(adding.activity.name, trip, updated, dayIndex)) }
                },
                onFailure = { error -> updateAdding { it.copy(loading = false, error = error.message) } },
            )
        }
    }

    fun dismissAddToTrip() {
        mutableState.update { it.copy(adding = null) }
    }

    private fun updateAdding(change: (AddToTripState) -> AddToTripState) {
        mutableState.update { current -> current.copy(adding = current.adding?.let(change)) }
    }
}

// "Added Queen Elizabeth Park to your Vancouver trip, dropping Kitsilano Beach to make room."
private fun addedText(placeName: String, before: Itinerary, after: Itinerary, dayIndex: Int): String {
    val kept = after.days.getOrNull(dayIndex)?.stops.orEmpty().map { it.activityId }.toSet()
    val dropped = before.days.getOrNull(dayIndex)?.stops.orEmpty().filter { it.activityId !in kept }.map { it.name }
    val makingRoom = if (dropped.isEmpty()) "" else ", dropping ${dropped.joinToString(" and ")} to make room"
    return "Added $placeName to your ${before.city} trip$makingRoom."
}
