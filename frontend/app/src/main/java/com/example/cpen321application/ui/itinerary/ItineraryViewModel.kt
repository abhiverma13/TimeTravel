package com.example.cpen321application.ui.itinerary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.GroupRepository
import com.example.cpen321application.data.Itinerary
import com.example.cpen321application.data.ItineraryStop
import com.example.cpen321application.data.TimeTravelRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ItineraryUiState {
    data object Loading : ItineraryUiState

    data class Loaded(val itinerary: Itinerary) : ItineraryUiState

    data class Failed(val message: String) : ItineraryUiState
}

/** View Itinerary: loads one of the traveller's personal or group plans; group members can veto its stops. */
class ItineraryViewModel(
    private val repository: TimeTravelRepository,
    private val groups: GroupRepository,
    private val itineraryId: String,
    private val myUserId: String,
) : ViewModel() {
    private val mutableState = MutableStateFlow<ItineraryUiState>(ItineraryUiState.Loading)
    val state: StateFlow<ItineraryUiState> = mutableState.asStateFlow()

    private val mutableMessage = MutableStateFlow<String?>(null)

    /** A short note to show once, such as the result of a veto. */
    val message: StateFlow<String?> = mutableMessage.asStateFlow()

    init {
        load()
    }

    fun load() {
        mutableState.value = ItineraryUiState.Loading
        viewModelScope.launch {
            mutableState.value = repository.itinerary(itineraryId).fold(
                onSuccess = { ItineraryUiState.Loaded(it) },
                onFailure = { ItineraryUiState.Failed(it.message ?: "Could not load this itinerary.") },
            )
        }
    }

    /** Adds the stop to the traveller's vetoes for the trip's group, so the group's next plans leave it out. */
    fun veto(stop: ItineraryStop) {
        val groupId = (state.value as? ItineraryUiState.Loaded)?.itinerary?.groupId ?: return
        viewModelScope.launch {
            mutableMessage.value = groups.veto(groupId, myUserId, stop.activityId).fold(
                onSuccess = { "Vetoed ${stop.name}: this group's next plans leave it out." },
                onFailure = { error -> error.message },
            )
        }
    }

    fun messageShown() {
        mutableMessage.value = null
    }
}
