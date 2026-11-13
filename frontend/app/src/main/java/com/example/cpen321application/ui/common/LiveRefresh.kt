package com.example.cpen321application.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.LiveEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/** For as long as the ViewModel lives, runs [refresh] whenever a live event of one of [types] arrives that [matches]. */
fun ViewModel.refreshOn(events: Flow<LiveEvent>, types: Set<String>, matches: (LiveEvent) -> Boolean = { true }, refresh: () -> Unit) {
    viewModelScope.launch {
        events.filter { it.type in types && matches(it) }.collect { refresh() }
    }
}
