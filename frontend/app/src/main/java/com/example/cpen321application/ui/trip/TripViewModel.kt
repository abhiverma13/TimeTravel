package com.example.cpen321application.ui.trip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.AdjustRequest
import com.example.cpen321application.data.ApiException
import com.example.cpen321application.data.GroupRepository
import com.example.cpen321application.data.Trip
import com.example.cpen321application.data.TripChange
import com.example.cpen321application.data.TripStop
import com.example.cpen321application.data.LiveTrip
import com.example.cpen321application.data.LiveTripClient
import com.example.cpen321application.data.LiveStatus
import com.example.cpen321application.data.Suggestion
import com.example.cpen321application.data.TimeTravelRepository
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface TripUiState {
    data object Loading : TripUiState

    data class Loaded(val trip: Trip) : TripUiState

    data class Failed(val message: String) : TripUiState
}

private const val HTTP_CONFLICT = 409
private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** What the trip screen needs besides the trip itself. */
data class TripDependencies(
    val repository: TimeTravelRepository,
    val groups: GroupRepository,
    val live: LiveTripClient,
    val myUserId: String,
)

/**
 * View & Adjust Trip: shows one personal or group plan, keeps it live while it is on screen, and sends the
 * traveller's adjustments. Every member's change arrives here within seconds.
 */
class TripViewModel(private val dependencies: TripDependencies, private val tripId: String) : ViewModel() {
    private val mutableState = MutableStateFlow<TripUiState>(TripUiState.Loading)
    val state: StateFlow<TripUiState> = mutableState.asStateFlow()

    private val mutableLive = MutableStateFlow(LiveStatus.CONNECTING)
    val live: StateFlow<LiveStatus> = mutableLive.asStateFlow()

    private val mutableBusy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = mutableBusy.asStateFlow()

    private val mutableMessage = MutableStateFlow<String?>(null)

    /** A short note to show once: someone else's change, or why an adjustment was refused. */
    val message: StateFlow<String?> = mutableMessage.asStateFlow()

    private val mutableSuggestions = MutableStateFlow<List<Suggestion>>(emptyList())

    /** Changes proposed after a disruption, waiting for someone in the trip to accept or dismiss them. */
    val suggestions: StateFlow<List<Suggestion>> = mutableSuggestions.asStateFlow()

    private val connection: LiveTrip = dependencies.live.open(
        tripId,
        onStatus = ::onLiveStatus,
        onChange = ::onLiveChange,
        onSuggestion = { suggestion -> mutableSuggestions.update { list -> list.filterNot { it.id == suggestion.id } + suggestion } },
    )

    init {
        load()
    }

    fun load() {
        mutableState.value = TripUiState.Loading
        refresh()
    }

    fun setLocked(dayIndex: Int, stop: TripStop, locked: Boolean) =
        adjust { version -> AdjustRequest(if (locked) "lock" else "unlock", version, dayIndex, stop.activityId) }

    fun move(dayIndex: Int, stop: TripStop, toIndex: Int) =
        adjust { version -> AdjustRequest("move", version, dayIndex, stop.activityId, toIndex = toIndex) }

    fun setVisited(dayIndex: Int, stop: TripStop, visited: Boolean) =
        adjust { version -> AdjustRequest(if (visited) "visit" else "unvisit", version, dayIndex, stop.activityId) }

    fun remove(dayIndex: Int, stop: TripStop) = adjust { version -> AdjustRequest("remove", version, dayIndex, stop.activityId) }

    /** Re-plans a day: today from now on (stops already started stay), any other day in full. Locked stops stay. */
    fun replanDay(dayIndex: Int, date: String) {
        val fromTime = if (date == LocalDate.now().toString()) LocalTime.now().format(CLOCK) else null
        adjust { version -> AdjustRequest("replan", version, dayIndex, fromTime = fromTime) }
    }

    /** Adds the stop to the traveller's vetoes for the trip's group, so the group's next plans leave it out. */
    fun veto(stop: TripStop) {
        val groupId = loadedTrip()?.groupId ?: return
        viewModelScope.launch {
            mutableMessage.value = dependencies.groups.veto(groupId, dependencies.myUserId, stop.activityId).fold(
                onSuccess = { "Vetoed ${stop.name}: this group's next plans leave it out." },
                onFailure = { error -> error.message },
            )
        }
    }

    /** Applies a suggestion for everyone; refused (and dropped) if the trip changed since it was made. */
    fun acceptSuggestion(suggestion: Suggestion) {
        mutableBusy.value = true
        viewModelScope.launch {
            dependencies.repository.acceptSuggestion(suggestion.id).fold(
                onSuccess = { trip ->
                    showIfNewer(trip)
                    mutableMessage.value = "Done: the plan is updated for everyone in the trip."
                },
                onFailure = { error -> mutableMessage.value = error.message },
            )
            mutableSuggestions.update { list -> list.filterNot { it.id == suggestion.id } }
            mutableBusy.value = false
        }
    }

    fun dismissSuggestion(suggestion: Suggestion) {
        mutableSuggestions.update { list -> list.filterNot { it.id == suggestion.id } }
        viewModelScope.launch {
            dependencies.repository.dismissSuggestion(suggestion.id).onFailure { error -> mutableMessage.value = error.message }
        }
    }

    fun messageShown() {
        mutableMessage.value = null
    }

    override fun onCleared() {
        connection.close()
    }

    private fun adjust(request: (version: Int) -> AdjustRequest) {
        val current = loadedTrip() ?: return
        mutableBusy.value = true
        viewModelScope.launch {
            dependencies.repository.adjustTrip(tripId, request(current.version)).fold(
                onSuccess = ::showIfNewer,
                onFailure = { error ->
                    if ((error as? ApiException)?.status == HTTP_CONFLICT) {
                        refresh()
                        mutableMessage.value = "Someone changed this plan first. Here is the latest version."
                    } else {
                        mutableMessage.value = error.message
                    }
                },
            )
            mutableBusy.value = false
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            // Suggestions are made for one version of the trip, so they are reloaded with it.
            dependencies.repository.suggestions(tripId).onSuccess { mutableSuggestions.value = it }
            dependencies.repository.trip(tripId).fold(
                onSuccess = { trip -> mutableState.value = TripUiState.Loaded(trip) },
                onFailure = { error ->
                    if (loadedTrip() == null) {
                        mutableState.value = TripUiState.Failed(error.message ?: "Could not load this trip.")
                    }
                },
            )
        }
    }

    // The REST reply and the live push for the same change can arrive in either order; keep the newest version.
    private fun showIfNewer(trip: Trip) {
        val current = loadedTrip()
        if (current == null || trip.version > current.version) {
            mutableState.value = TripUiState.Loaded(trip)
        }
    }

    private fun onLiveStatus(status: LiveStatus) {
        val reconnected = status == LiveStatus.LIVE && mutableLive.value == LiveStatus.OFFLINE
        mutableLive.value = status
        if (reconnected) {
            refresh()
        }
    }

    private fun onLiveChange(change: TripChange) {
        val wasNewer = (loadedTrip()?.version ?: -1) < change.trip.version
        showIfNewer(change.trip)
        if (wasNewer) {
            viewModelScope.launch { dependencies.repository.suggestions(tripId).onSuccess { mutableSuggestions.value = it } }
        }
        if (wasNewer && change.actorId != dependencies.myUserId) {
            mutableMessage.value = change.summary
        }
    }

    private fun loadedTrip(): Trip? = (state.value as? TripUiState.Loaded)?.trip
}
