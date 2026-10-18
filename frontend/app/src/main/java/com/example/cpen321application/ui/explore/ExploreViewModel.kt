package com.example.cpen321application.ui.explore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ReviewTags
import com.example.cpen321application.data.TimeTravelRepository
import com.example.cpen321application.data.TravelActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
}
