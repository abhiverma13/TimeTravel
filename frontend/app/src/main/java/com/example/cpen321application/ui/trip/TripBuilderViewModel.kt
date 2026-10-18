package com.example.cpen321application.ui.trip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.GenerateItineraryRequest
import com.example.cpen321application.data.TimeTravelRepository
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
    val pace: String = "moderate",
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
) : ViewModel() {
    private val mutableState = MutableStateFlow(TripBuilderUiState(city = homeCity, interests = profileInterests.toSet()))
    val state: StateFlow<TripBuilderUiState> = mutableState.asStateFlow()

    fun onCityChange(city: String) = mutableState.update { it.copy(city = city, error = null) }

    fun onDatesChange(start: LocalDate?, end: LocalDate?) = mutableState.update { it.copy(startDate = start, endDate = end, error = null) }

    fun onDayStartChange(time: String) = mutableState.update { it.copy(dayStart = time, error = null) }

    fun onDayEndChange(time: String) = mutableState.update { it.copy(dayEnd = time, error = null) }

    fun onArrivalChange(time: String?) = mutableState.update { it.copy(arrivalTime = time) }

    fun onDepartureChange(time: String?) = mutableState.update { it.copy(departureTime = time) }

    fun onLodgingChange(lodging: String) = mutableState.update { it.copy(lodging = lodging) }

    fun onPaceChange(pace: String) = mutableState.update { it.copy(pace = pace) }

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
    )
}
