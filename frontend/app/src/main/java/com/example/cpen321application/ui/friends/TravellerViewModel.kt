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

data class TravellerUiState(
    val loading: Boolean = true,
    val traveller: Traveller? = null,
    val error: String? = null,
    val busy: Boolean = false,
    val actionError: String? = null,
)

/** Another traveller's profile, and the friendship actions that fit it. */
class TravellerViewModel(private val friends: FriendRepository, private val userId: String) : ViewModel() {
    private val mutableState = MutableStateFlow(TravellerUiState())
    val state: StateFlow<TravellerUiState> = mutableState.asStateFlow()

    init {
        load()
    }

    fun load() {
        mutableState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val result = friends.traveller(userId)
            mutableState.update { current ->
                result.fold(
                    onSuccess = { traveller -> current.copy(loading = false, traveller = traveller) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun act(action: FriendAction) {
        val traveller = state.value.traveller ?: return
        mutableState.update { it.copy(busy = true, actionError = null) }
        viewModelScope.launch {
            val result = friends.perform(traveller, action)
            result.onFailure { error -> mutableState.update { it.copy(busy = false, actionError = error.message) } }
            // Reloaded so the friend count stays right.
            result.onSuccess {
                mutableState.update { it.copy(busy = false) }
                load()
            }
        }
    }
}
