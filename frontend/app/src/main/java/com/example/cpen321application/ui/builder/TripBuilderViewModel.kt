package com.example.cpen321application.ui.trip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.GenerateItineraryRequest
import com.example.cpen321application.data.TimeTravelRepository
import com.example.cpen321application.data.TravelActivity
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

const val MAX_TRIP_DAYS = 7
private const val MIN_DAY_MINUTES = 120
private const val MINUTES_PER_HOUR = 60

val PACES = listOf("relaxed" to "Relaxed", "moderate" to "Moderate", "packed" to "Packed")

/** The group a trip is planned for. */
data class TripGroup(val id: String, val name: String)

/** The must-see and avoid picker: the destination's places, while it is open. */
data class PlacePickerState(val loading: Boolean = true, val places: List<TravelActivity> = emptyList(), val error: String? = null)

data class TripBuilderUiState(
    val city: String,
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
    val dayStart: String = "09:00",
    val dayEnd: String = "18:00",
    /** HH:MM on the first day, or null to start at dayStart. */
    val arrivalTime: String? = null,
    /** HH:MM on the last day, or null to end at dayEnd. */
    val departureTime: String? = null,
    val lodging: String = "",
    val interests: Set<String>,
    /** Set when planning for a group: the members' interests and vetoes are used instead of `interests`. */
    val group: TripGroup? = null,
    val pace: String = "moderate",
    val transportMode: String = "transit",
    val budget: String = "any",
    /** Places marked must-see or avoid, by activity id. */
    val placeChoices: Map<String, PlaceChoice> = emptyMap(),
    val placePicker: PlacePickerState? = null,
    val generating: Boolean = false,
    val error: String? = null,
    /** Set once the plan is generated, so the screen can open it. */
    val generatedItineraryId: String? = null,
)

private fun minutes(clockTime: String): Int {
    val (hours, minutes) = clockTime.split(':').map(String::toInt)
    return hours * MINUTES_PER_HOUR + minutes
}

/** Create Trip and Generate Itinerary: collects the trip details and asks the Itinerary Engine for a plan. */
class TripBuilderViewModel(
    private val repository: TimeTravelRepository,
    homeCity: String,
    profileInterests: List<String>,
    group: TripGroup? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow(TripBuilderUiState(city = homeCity, interests = profileInterests.toSet(), group = group))
    val state: StateFlow<TripBuilderUiState> = mutableState.asStateFlow()

    // Must-see and avoid choices are places in one city, so a new destination clears them.
    fun onCityChange(city: String) = mutableState.update { it.copy(city = city, error = null, placeChoices = emptyMap()) }

    fun onDatesChange(start: LocalDate?, end: LocalDate?) = mutableState.update { it.copy(startDate = start, endDate = end, error = null) }

    fun onDayStartChange(time: String) = mutableState.update { it.copy(dayStart = time, error = null) }

    fun onDayEndChange(time: String) = mutableState.update { it.copy(dayEnd = time, error = null) }

    fun onArrivalChange(time: String?) = mutableState.update { it.copy(arrivalTime = time) }

    fun onDepartureChange(time: String?) = mutableState.update { it.copy(departureTime = time) }

    fun onLodgingChange(lodging: String) = mutableState.update { it.copy(lodging = lodging) }

    fun onPaceChange(pace: String) = mutableState.update { it.copy(pace = pace) }

    fun onTransportModeChange(mode: String) = mutableState.update { it.copy(transportMode = mode) }

    fun onBudgetChange(budget: String) = mutableState.update { it.copy(budget = budget) }

    /** Opens the must-see and avoid picker with the destination's places, best-rated first. */
    fun openPlacePicker() {
        val city = state.value.city.trim()
        if (city.isEmpty()) {
            mutableState.update { it.copy(error = "Enter a destination city.") }
            return
        }
        mutableState.update { it.copy(placePicker = PlacePickerState()) }
        viewModelScope.launch {
            val result = repository.activities(city, interest = null)
            mutableState.update { current ->
                current.copy(
                    placePicker = result.fold(
                        onSuccess = { places -> PlacePickerState(loading = false, places = places) },
                        onFailure = { error -> PlacePickerState(loading = false, error = error.message) },
                    ),
                )
            }
        }
    }

    fun closePlacePicker() = mutableState.update { it.copy(placePicker = null) }

    fun cyclePlace(activityId: String) = mutableState.update {
        val next = (it.placeChoices[activityId] ?: PlaceChoice.NEUTRAL).next()
        it.copy(placeChoices = if (next == PlaceChoice.NEUTRAL) it.placeChoices - activityId else it.placeChoices + (activityId to next))
    }

    fun onInterestToggle(tag: String) = mutableState.update {
        it.copy(interests = if (tag in it.interests) it.interests - tag else it.interests + tag)
    }

    fun generate() {
        val current = state.value
        val problem = validationProblem(current)
        if (problem != null) {
            mutableState.update { it.copy(error = problem) }
            return
        }
        mutableState.update { it.copy(generating = true, error = null) }
        viewModelScope.launch {
            repository.generateItinerary(current.toRequest()).fold(
                onSuccess = { itinerary -> mutableState.update { it.copy(generating = false, generatedItineraryId = itinerary.id) } },
                onFailure = { error -> mutableState.update { it.copy(generating = false, error = error.message) } },
            )
        }
    }

    fun itineraryOpened() = mutableState.update { it.copy(generatedItineraryId = null) }

    private fun validationProblem(trip: TripBuilderUiState): String? {
        val start = trip.startDate
        val end = trip.endDate
        return when {
            trip.city.isBlank() -> "Enter a destination city."
            start == null || end == null -> "Choose your trip dates."
            ChronoUnit.DAYS.between(start, end) + 1 > MAX_TRIP_DAYS -> "Trips can be at most $MAX_TRIP_DAYS days."
            minutes(trip.dayEnd) - minutes(trip.dayStart) < MIN_DAY_MINUTES ->
                "Your day must end at least 2 hours after it starts."
            else -> null
        }
    }

    private fun TripBuilderUiState.toRequest() = GenerateItineraryRequest(
        city = city.trim(),
        startDate = startDate.toString(),
        endDate = endDate.toString(),
        dayStart = dayStart,
        dayEnd = dayEnd,
        arrivalTime = arrivalTime,
        departureTime = departureTime,
        interests = interests.toList(),
        pace = pace,
        lodging = lodging.trim().ifEmpty { null },
        groupId = group?.id,
        transportMode = transportMode,
        budget = budget,
        mustSeeIds = placeChoices.filterValues { it == PlaceChoice.MUST_SEE }.keys.toList(),
        avoidIds = placeChoices.filterValues { it == PlaceChoice.AVOID }.keys.toList(),
    )
}
