package com.example.cpen321application.ui.friends

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.FriendRepository
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.ui.feed.toggleLike
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
    /** Their shared trips you may see; none for a private account you are not friends with. */
    val posts: List<Post> = emptyList(),
)

/** Another traveller's profile, their shared trips, and the friendship actions that fit it. */
class TravellerViewModel(private val friends: FriendRepository, private val posts: PostRepository, private val userId: String) : ViewModel() {
    private val mutableState = MutableStateFlow(TravellerUiState())
    val state: StateFlow<TravellerUiState> = mutableState.asStateFlow()

    init {
        load()
    }

    fun load() {
        mutableState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val result = friends.traveller(userId)
            val shared = posts.postsBy(userId).getOrDefault(emptyList())
            mutableState.update { current ->
                result.fold(
                    onSuccess = { traveller -> current.copy(loading = false, traveller = traveller, posts = shared) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun toggleLike(post: Post) {
        viewModelScope.launch {
            posts.toggleLike(post).onSuccess { updated ->
                mutableState.update { it.copy(posts = it.posts.map { old -> if (old.id == updated.id) updated else old }) }
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
