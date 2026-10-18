package com.example.cpen321application.ui.itinerary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.Itinerary
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

/** View Itinerary: loads one of the traveller's stored plans. */
class ItineraryViewModel(private val repository: TimeTravelRepository, private val itineraryId: String) : ViewModel() {
    private val mutableState = MutableStateFlow<ItineraryUiState>(ItineraryUiState.Loading)
    val state: StateFlow<ItineraryUiState> = mutableState.asStateFlow()

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
}
