package com.example.cpen321application.ui.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.Group
import com.example.cpen321application.data.GroupMember
import com.example.cpen321application.data.GroupRepository
import com.example.cpen321application.data.ItinerarySummary
import com.example.cpen321application.data.TimeTravelRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** An action that needs the traveller to confirm it first. */
sealed interface GroupConfirm {
    data object Leave : GroupConfirm

    data object Delete : GroupConfirm

    data class Remove(val member: GroupMember) : GroupConfirm
}

data class GroupDetailUiState(
    val loading: Boolean = true,
    val group: Group? = null,
    val trips: List<ItinerarySummary> = emptyList(),
    val error: String? = null,
    /** The traveller's interests for this group, as edited on screen. */
    val myInterests: Set<String> = emptySet(),
    val myVetoCount: Int = 0,
    val saving: Boolean = false,
    val confirming: GroupConfirm? = null,
    /** A short note to show once, such as "Interests saved". */
    val message: String? = null,
    /** True once the traveller left or deleted the group, so the screen closes. */
    val closed: Boolean = false,
)

/** Set Group Preferences, Leave Group and Remove Member, on one group's page. */
class GroupDetailViewModel(
    private val groups: GroupRepository,
    private val repository: TimeTravelRepository,
    private val groupId: String,
    private val myUserId: String,
) : ViewModel() {
    private val mutableState = MutableStateFlow(GroupDetailUiState())
    val state: StateFlow<GroupDetailUiState> = mutableState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val group = groups.group(groupId)
            val trips = repository.recentItineraries(groupId).getOrDefault(emptyList())
            mutableState.update { current ->
                group.fold(
                    onSuccess = { loaded -> showGroup(current.copy(loading = false, trips = trips, error = null), loaded) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun toggleInterest(tag: String) = mutableState.update {
        it.copy(myInterests = if (tag in it.myInterests) it.myInterests - tag else it.myInterests + tag)
    }

    fun saveInterests() = save("Interests saved for this group.") { groups.setInterests(groupId, state.value.myInterests.toList()) }

    fun clearVetoes() = save("Vetoes cleared.") { groups.setVetoes(groupId, emptyList()) }

    fun ask(confirm: GroupConfirm) = mutableState.update { it.copy(confirming = confirm) }

    fun dismissConfirm() = mutableState.update { it.copy(confirming = null) }

    fun messageShown() = mutableState.update { it.copy(message = null) }

    fun confirm() {
        val action = state.value.confirming ?: return
        mutableState.update { it.copy(confirming = null, saving = true) }
        viewModelScope.launch {
            val result = when (action) {
                GroupConfirm.Leave -> groups.removeMember(groupId, myUserId)
                GroupConfirm.Delete -> groups.deleteGroup(groupId)
                is GroupConfirm.Remove -> groups.removeMember(groupId, action.member.userId)
            }
            result.fold(
                onSuccess = { if (action is GroupConfirm.Remove) load() else mutableState.update { it.copy(closed = true) } },
                onFailure = { error -> mutableState.update { it.copy(message = error.message) } },
            )
            mutableState.update { it.copy(saving = false) }
        }
    }

    private fun save(done: String, call: suspend () -> Result<Group>) {
        mutableState.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = call()
            mutableState.update { current ->
                result.fold(
                    onSuccess = { group -> showGroup(current.copy(saving = false, message = done), group) },
                    onFailure = { error -> current.copy(saving = false, message = error.message) },
                )
            }
        }
    }

    private fun showGroup(state: GroupDetailUiState, group: Group): GroupDetailUiState {
        val me = group.members.firstOrNull { it.userId == myUserId }
        return state.copy(group = group, myInterests = me?.interests.orEmpty().toSet(), myVetoCount = me?.vetoedActivityIds?.size ?: 0)
    }
}
