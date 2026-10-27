package com.example.cpen321application.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.FriendLists
import com.example.cpen321application.data.FriendRepository
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.ui.friends.FriendAction
import com.example.cpen321application.ui.friends.perform
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileUiState(
    val loading: Boolean = true,
    val lists: FriendLists? = null,
    val error: String? = null,
    /** Travellers with a friendship change in progress. */
    val busyIds: Set<String> = emptySet(),
    val savingPrivacy: Boolean = false,
    val actionError: String? = null,
)

/** The Profile tab's friends: requests to answer, friends, requests sent, and whether the account is private. */
class ProfileViewModel(private val friends: FriendRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = mutableState.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            val result = friends.friends()
            mutableState.update { current ->
                result.fold(
                    onSuccess = { lists -> current.copy(loading = false, lists = lists, error = null) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun act(traveller: Traveller, action: FriendAction) {
        mutableState.update { it.copy(busyIds = it.busyIds + traveller.id, actionError = null) }
        viewModelScope.launch {
            val result = friends.perform(traveller, action)
            mutableState.update { current ->
                current.copy(busyIds = current.busyIds - traveller.id, actionError = result.exceptionOrNull()?.message)
            }
            // The traveller moves between lists, so the lists are reloaded.
            refresh()
        }
    }

    fun setPrivate(isPrivate: Boolean) {
        mutableState.update { it.copy(savingPrivacy = true, actionError = null) }
        viewModelScope.launch {
            val result = friends.setPrivate(isPrivate)
            mutableState.update { current ->
                result.fold(
                    onSuccess = { saved -> current.copy(savingPrivacy = false, lists = current.lists?.copy(isPrivate = saved)) },
                    onFailure = { error -> current.copy(savingPrivacy = false, actionError = error.message) },
                )
            }
        }
    }
}
