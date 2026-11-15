package com.example.cpen321application.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.AppNotification
import com.example.cpen321application.data.LiveEvent
import com.example.cpen321application.data.NotificationList
import com.example.cpen321application.data.NotificationRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class UnreadUiState(
    /** Unread notifications per area: a red dot on the area's tab while above zero. */
    val counts: Map<String, Int> = emptyMap(),
    /** What was new in each area during the traveller's current visit to it: a red dot on each row it concerns. */
    val fresh: Map<String, List<AppNotification>> = emptyMap(),
) {
    fun freshIn(area: String): List<AppNotification> = fresh[area].orEmpty()
}

/**
 * The red dots. A tab shows one while its part of the app has unread notifications; live events add to them as they
 * arrive. Opening the tab marks its notifications read and keeps them for the visit, so the rows they concern
 * (a group, a trip, a post) show a dot of their own.
 */
class UnreadViewModel(private val notifications: NotificationRepository, liveEvents: Flow<LiveEvent>) : ViewModel() {
    private val mutableState = MutableStateFlow(UnreadUiState())
    val state: StateFlow<UnreadUiState> = mutableState.asStateFlow()

    init {
        open(area = null, sameVisit = false)
        viewModelScope.launch {
            liveEvents.collect { event ->
                mutableState.update { it.copy(counts = it.counts + (event.area to (it.counts[event.area] ?: 0) + 1)) }
            }
        }
    }

    /**
     * Fetches the unread notifications. With an [area], the traveller is looking at it: its unread notifications join
     * the visit's (or start a new visit) and are marked read, which clears the tab's dot.
     */
    fun open(area: String?, sameVisit: Boolean) {
        viewModelScope.launch {
            notifications.notifications().onSuccess { list -> show(list, area, sameVisit) }
        }
    }

    private suspend fun show(list: NotificationList, area: String?, sameVisit: Boolean) {
        val seen = list.notifications.filter { !it.read && it.area == area }
        val counts = if (area != null && seen.isNotEmpty()) notifications.markRead(area).getOrNull() ?: list.unread else list.unread
        mutableState.update { current ->
            if (area == null) {
                current.copy(counts = counts)
            } else {
                val earlier = if (sameVisit) current.freshIn(area) else emptyList()
                current.copy(counts = counts, fresh = current.fresh + (area to (earlier + seen).distinctBy { it.id }))
            }
        }
    }
}
