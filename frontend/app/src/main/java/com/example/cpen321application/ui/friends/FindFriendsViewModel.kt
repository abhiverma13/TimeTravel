package com.example.cpen321application.ui.friends

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.FriendRepository
import com.example.cpen321application.data.Traveller
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val MIN_SEARCH_LENGTH = 2

data class FindFriendsUiState(
    val query: String = "",
    val searching: Boolean = false,
    /** Null until the first search. */
    val results: List<Traveller>? = null,
    val searchedFor: String = "",
    val error: String? = null,
    /** Travellers with a friendship change in progress. */
    val busyIds: Set<String> = emptySet(),
)

/** Searches travellers by name or email and sends, cancels or accepts friend requests from the results. */
class FindFriendsViewModel(private val friends: FriendRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(FindFriendsUiState())
    val state: StateFlow<FindFriendsUiState> = mutableState.asStateFlow()

    fun onQueryChange(query: String) = mutableState.update { it.copy(query = query, error = null) }

    fun search() {
        val query = state.value.query.trim()
        if (query.length < MIN_SEARCH_LENGTH) {
            mutableState.update { it.copy(error = "Type at least $MIN_SEARCH_LENGTH letters of a name, or an email.") }
            return
        }
        mutableState.update { it.copy(searching = true, error = null) }
        viewModelScope.launch {
            val result = friends.search(query)
            mutableState.update { current ->
                result.fold(
                    onSuccess = { found -> current.copy(searching = false, results = found, searchedFor = query) },
                    onFailure = { error -> current.copy(searching = false, error = error.message) },
                )
            }
        }
    }

    fun act(traveller: Traveller, action: FriendAction) {
        mutableState.update { it.copy(busyIds = it.busyIds + traveller.id, error = null) }
        viewModelScope.launch {
            val result = friends.perform(traveller, action)
            mutableState.update { current ->
                val busyIds = current.busyIds - traveller.id
                result.fold(
                    onSuccess = { updated ->
                        current.copy(busyIds = busyIds, results = current.results?.map { if (it.id == updated.id) updated else it })
                    },
                    onFailure = { error -> current.copy(busyIds = busyIds, error = error.message) },
                )
            }
        }
    }
}
