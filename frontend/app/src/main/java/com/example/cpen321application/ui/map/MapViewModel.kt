package com.example.cpen321application.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.AdjustRequest
import com.example.cpen321application.data.GeoPoint
import com.example.cpen321application.data.Trip
import com.example.cpen321application.data.TripStop
import com.example.cpen321application.data.LiveTrip
import com.example.cpen321application.data.LiveTripClient
import com.example.cpen321application.data.MemberLocation
import com.example.cpen321application.data.TimeTravelRepository
import com.example.cpen321application.ui.trip.ACCESS_LOST_MESSAGE
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Being this close to a stop of today counts as having arrived there. */
const val ARRIVAL_RADIUS_M = 100.0

data class MapUiState(
    val trip: Trip? = null,
    val error: String? = null,
    val dayIndex: Int = 0,
    val myLocation: GeoPoint? = null,
    /** Other members' shared positions, by user id. */
    val members: Map<String, MemberLocation> = emptyMap(),
    val sharing: Boolean = false,
    /** A one-time note, such as a stop ticked off on arrival. */
    val message: String? = null,
)

/** The day's next stop that is not visited yet, and how far away it is. */
data class NextStop(val stop: TripStop, val metresAway: Double?)

/**
 * The trip map: the day's stops in order, where you are, and (on a group trip) where the members sharing their position
 * are. On the trip's current day, a stop is ticked off as visited when you arrive within 100 m of it.
 */
class MapViewModel(
    private val repository: TimeTravelRepository,
    live: LiveTripClient,
    private val tripId: String,
    private val today: LocalDate = LocalDate.now(),
) : ViewModel() {
    private val mutableState = MutableStateFlow(MapUiState())
    val state: StateFlow<MapUiState> = mutableState.asStateFlow()

    // Stops a visit was already sent for, so a slow reply does not send it twice.
    private val visiting = mutableSetOf<String>()

    private val connection: LiveTrip = live.open(
        tripId,
        onStatus = {},
        onChange = { change -> mutableState.update { it.copy(trip = change.trip) } },
        onMemberLocation = { member -> mutableState.update { it.copy(members = it.members + (member.userId to member)) } },
        onMemberGone = { userId -> mutableState.update { it.copy(members = it.members - userId) } },
        // Stops sharing too: positions are only sent while `sharing` is on.
        onAccessLost = { mutableState.update { it.copy(trip = null, members = emptyMap(), sharing = false, error = ACCESS_LOST_MESSAGE) } },
    )

    init {
        viewModelScope.launch {
            repository.trip(tripId).fold(
                onSuccess = { trip ->
                    val todayIndex = trip.days.indexOfFirst { it.date == today.toString() }
                    mutableState.update { it.copy(trip = trip, dayIndex = todayIndex.coerceAtLeast(0)) }
                },
                onFailure = { error -> mutableState.update { it.copy(error = error.message) } },
            )
        }
    }

    fun selectDay(dayIndex: Int) = mutableState.update { it.copy(dayIndex = dayIndex) }

    /** True when the day on the map is today, the only day stops are ticked off by arriving. */
    fun isToday(state: MapUiState): Boolean = state.trip?.days?.getOrNull(state.dayIndex)?.date == today.toString()

    fun nextStop(state: MapUiState): NextStop? {
        val stop = state.trip?.days?.getOrNull(state.dayIndex)?.stops?.firstOrNull { !it.visited } ?: return null
        return NextStop(stop, state.myLocation?.let { distanceMetres(it, stop.location) })
    }

    fun onLocation(location: GeoPoint) {
        mutableState.update { it.copy(myLocation = location) }
        if (state.value.sharing) {
            connection.shareLocation(location.lat, location.lng)
        }
        tickOffArrivals(location)
    }

    fun setSharing(sharing: Boolean) {
        mutableState.update { it.copy(sharing = sharing) }
        val location = state.value.myLocation
        if (!sharing) {
            connection.stopSharingLocation()
        } else if (location != null) {
            connection.shareLocation(location.lat, location.lng)
        }
    }

    fun messageShown() = mutableState.update { it.copy(message = null) }

    override fun onCleared() {
        connection.close()
    }

    private fun tickOffArrivals(location: GeoPoint) {
        val current = state.value
        val trip = current.trip ?: return
        val dayIndex = trip.days.indexOfFirst { it.date == today.toString() }
        val arrived = trip.days.getOrNull(dayIndex)?.stops?.firstOrNull { stop ->
            !stop.visited && stop.activityId !in visiting && distanceMetres(location, stop.location) <= ARRIVAL_RADIUS_M
        } ?: return
        visiting += arrived.activityId
        viewModelScope.launch {
            repository.adjustTrip(tripId, AdjustRequest("visit", trip.version, dayIndex, arrived.activityId)).fold(
                onSuccess = { updated -> mutableState.update { it.copy(trip = updated, message = "You're at ${arrived.name}: ticked off as visited.") } },
                // Someone else changed the trip first; the next position update tries again with the new version.
                onFailure = { visiting -= arrived.activityId },
            )
        }
    }
}
