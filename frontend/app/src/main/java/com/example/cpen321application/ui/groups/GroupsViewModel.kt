package com.example.cpen321application.ui.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.Group
import com.example.cpen321application.data.GroupRepository
import com.example.cpen321application.data.GroupSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val INVITE_CODE_LENGTH = 6

enum class GroupsDialog { CREATE, JOIN }

data class GroupsUiState(
    val loading: Boolean = true,
    val groups: List<GroupSummary> = emptyList(),
    val error: String? = null,
    val dialog: GroupsDialog? = null,
    val working: Boolean = false,
    val dialogError: String? = null,
    /** Set once a group is created or joined, so the screen can open it. */
    val openedGroupId: String? = null,
)

/** Create Group and Join Group: lists the traveller's groups and makes or joins new ones. */
class GroupsViewModel(private val groups: GroupRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(GroupsUiState())
    val state: StateFlow<GroupsUiState> = mutableState.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            val result = groups.groups()
            mutableState.update { current ->
                result.fold(
                    onSuccess = { list -> current.copy(loading = false, groups = list, error = null) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun showDialog(dialog: GroupsDialog) = mutableState.update { it.copy(dialog = dialog, dialogError = null) }

    fun dismissDialog() = mutableState.update { it.copy(dialog = null, dialogError = null) }

    fun create(name: String) {
        if (name.isBlank()) {
            mutableState.update { it.copy(dialogError = "Give your group a name.") }
            return
        }
        submit { groups.createGroup(name) }
    }

    fun join(inviteCode: String) {
        if (inviteCode.trim().length != INVITE_CODE_LENGTH) {
            mutableState.update { it.copy(dialogError = "Invite codes are $INVITE_CODE_LENGTH characters.") }
            return
        }
        submit { groups.joinGroup(inviteCode) }
    }

    fun groupOpened() = mutableState.update { it.copy(openedGroupId = null) }

    private fun submit(call: suspend () -> Result<Group>) {
        mutableState.update { it.copy(working = true, dialogError = null) }
        viewModelScope.launch {
            val result = call()
            mutableState.update { current ->
                result.fold(
                    onSuccess = { group -> current.copy(working = false, dialog = null, openedGroupId = group.id) },
                    onFailure = { error -> current.copy(working = false, dialogError = error.message) },
                )
            }
        }
    }
}
