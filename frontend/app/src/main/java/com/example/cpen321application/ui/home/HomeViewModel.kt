package com.example.cpen321application.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.LiveEvent
import com.example.cpen321application.data.LiveEventTypes
import com.example.cpen321application.data.TimeTravelRepository
import com.example.cpen321application.data.TripSummary
import com.example.cpen321application.ui.common.refreshOn
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The traveller's recent trips for the home screen, refreshed whenever home is shown. */
class HomeViewModel(private val repository: TimeTravelRepository, liveEvents: Flow<LiveEvent>) : ViewModel() {
    private val mutableRecentTrips = MutableStateFlow<List<TripSummary>>(emptyList())
    val recentTrips: StateFlow<List<TripSummary>> = mutableRecentTrips.asStateFlow()

    init {
        // Group trips appear or go as the traveller joins or loses a group.
        val types = setOf(LiveEventTypes.REMOVED_FROM_GROUP, LiveEventTypes.GROUP_DELETED, LiveEventTypes.JOIN_ANSWERED)
        refreshOn(liveEvents, types) { refresh() }
    }

    fun refresh() {
        viewModelScope.launch {
            repository.recentTrips().onSuccess { mutableRecentTrips.value = it }
        }
    }
}
