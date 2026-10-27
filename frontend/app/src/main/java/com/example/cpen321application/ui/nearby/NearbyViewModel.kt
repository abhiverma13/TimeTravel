package com.example.cpen321application.ui.nearby

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.GeoPoint
import com.example.cpen321application.data.NearbyRepository
import com.example.cpen321application.data.NearbyTrip
import com.example.cpen321application.data.REQUEST_PENDING
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NearbyUiState(
    /** True while waiting for the device's position or the list. */
    val loading: Boolean = true,
    val trips: List<NearbyTrip> = emptyList(),
    val error: String? = null,
    /** The trip the traveller is writing a request for. */
    val asking: NearbyTrip? = null,
    val sending: Boolean = false,
    val message: String? = null,
)

/** The Nearby tab: group trips opened to travellers within 10 km, and asking to join them. */
class NearbyViewModel(private val nearby: NearbyRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(NearbyUiState())
    val state: StateFlow<NearbyUiState> = mutableState.asStateFlow()

    fun locating() = mutableState.update { it.copy(loading = true, error = null) }

    /** Lists the trips near this position, or explains that the position is unknown. */
    fun onPosition(position: GeoPoint?) {
        if (position == null) {
            mutableState.update { it.copy(loading = false, error = "Couldn't find where you are. Check that location is on, then refresh.") }
            return
        }
        viewModelScope.launch {
            val result = nearby.trips(position)
            mutableState.update { current ->
                result.fold(
                    onSuccess = { trips -> current.copy(loading = false, trips = trips, error = null) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun startAsking(trip: NearbyTrip) = mutableState.update { it.copy(asking = trip) }

    fun stopAsking() = mutableState.update { it.copy(asking = null) }

    fun ask(note: String) {
        val trip = state.value.asking ?: return
        mutableState.update { it.copy(sending = true) }
        viewModelScope.launch {
            val result = nearby.askToJoin(trip.itineraryId, note)
            mutableState.update { current ->
                result.fold(
                    onSuccess = {
                        current.copy(
                            sending = false,
                            asking = null,
                            trips = current.trips.map { if (it.itineraryId == trip.itineraryId) it.copy(myRequest = REQUEST_PENDING) else it },
                            message = "Asked to join ${trip.groupName}. ${trip.organizer} will answer from the group's page.",
                        )
                    },
                    onFailure = { error -> current.copy(sending = false, message = error.message) },
                )
            }
        }
    }

    fun messageShown() = mutableState.update { it.copy(message = null) }
}
