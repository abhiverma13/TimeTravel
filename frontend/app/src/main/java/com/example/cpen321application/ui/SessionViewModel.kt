package com.example.cpen321application.ui

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.TimeTravelRepository
import com.example.cpen321application.data.UserProfile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SessionState {
    /** Checking whether a stored session is still valid. */
    data object Checking : SessionState

    data class SignedOut(val message: String? = null, val signingIn: Boolean = false) : SessionState

    data class SignedIn(
        val user: UserProfile,
        val editingProfile: Boolean = false,
        val savingProfile: Boolean = false,
        val profileError: String? = null,
    ) : SessionState
}

/** Who is signed in. Restores a stored session at launch so travellers do not sign in every time. */
class SessionViewModel(private val repository: TimeTravelRepository) : ViewModel() {
    private val mutableState = MutableStateFlow<SessionState>(SessionState.Checking)
    val state: StateFlow<SessionState> = mutableState.asStateFlow()

    val isSignInConfigured: Boolean = repository.isSignInConfigured

    init {
        viewModelScope.launch {
            mutableState.value = repository.restoreSession().fold(
                onSuccess = { user -> if (user == null) SessionState.SignedOut() else SessionState.SignedIn(user) },
                onFailure = { error -> SessionState.SignedOut(error.message) },
            )
        }
    }

    fun signIn(activity: Activity) {
        mutableState.value = SessionState.SignedOut(signingIn = true)
        viewModelScope.launch {
            mutableState.value = repository.signIn(activity).fold(
                onSuccess = { user -> SessionState.SignedIn(user) },
                onFailure = { error -> SessionState.SignedOut(error.message) },
            )
        }
    }

    fun signOut() {
        repository.signOut()
        mutableState.value = SessionState.SignedOut()
    }

    fun editProfile() {
        updateSignedIn { it.copy(editingProfile = true, profileError = null) }
    }

    fun cancelProfileEdit() {
        updateSignedIn { it.copy(editingProfile = false, profileError = null) }
    }

    fun saveProfile(homeCity: String, interests: List<String>) {
        updateSignedIn { it.copy(savingProfile = true, profileError = null) }
        viewModelScope.launch {
            val result = repository.updateProfile(homeCity, interests)
            updateSignedIn { current ->
                result.fold(
                    onSuccess = { user -> SessionState.SignedIn(user) },
                    onFailure = { error -> current.copy(savingProfile = false, profileError = error.message) },
                )
            }
        }
    }

    private fun updateSignedIn(change: (SessionState.SignedIn) -> SessionState.SignedIn) {
        val current = mutableState.value
        if (current is SessionState.SignedIn) {
            mutableState.value = change(current)
        }
    }
}
