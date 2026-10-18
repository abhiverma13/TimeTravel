package com.example.cpen321application.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.ItinerarySummary
import com.example.cpen321application.data.TimeTravelRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The traveller's recent trips for the home screen, refreshed whenever home is shown. */
class HomeViewModel(private val repository: TimeTravelRepository) : ViewModel() {
    private val mutableRecentTrips = MutableStateFlow<List<ItinerarySummary>>(emptyList())
    val recentTrips: StateFlow<List<ItinerarySummary>> = mutableRecentTrips.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            repository.recentItineraries().onSuccess { mutableRecentTrips.value = it }
        }
    }
}
