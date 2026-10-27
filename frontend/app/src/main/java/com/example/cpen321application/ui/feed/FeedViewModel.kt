package com.example.cpen321application.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.FEED_EVERYONE
import com.example.cpen321application.data.FEED_PAGE_SIZE
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FeedUiState(
    val feed: String = FEED_EVERYONE,
    /** The city field as typed; `city` is the filter in use. */
    val cityInput: String = "",
    val city: String = "",
    val loading: Boolean = true,
    val posts: List<Post> = emptyList(),
    val error: String? = null,
    val loadingMore: Boolean = false,
    /** True while the last page was full, so there may be more. */
    val canLoadMore: Boolean = false,
)

/** The Feed tab: friends' or everyone's shared trips, optionally in one city, a page at a time. */
class FeedViewModel(private val posts: PostRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = mutableState.asStateFlow()

    fun refresh() {
        val current = state.value
        mutableState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val result = posts.feed(current.feed, current.city)
            mutableState.update { latest ->
                result.fold(
                    onSuccess = { page -> latest.copy(loading = false, posts = page, canLoadMore = page.size == FEED_PAGE_SIZE) },
                    onFailure = { error -> latest.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun selectFeed(feed: String) {
        mutableState.update { it.copy(feed = feed) }
        refresh()
    }

    fun onCityInputChange(text: String) = mutableState.update { it.copy(cityInput = text) }

    fun applyCity() {
        mutableState.update { it.copy(city = it.cityInput.trim()) }
        refresh()
    }

    fun loadMore() {
        val current = state.value
        val last = current.posts.lastOrNull() ?: return
        mutableState.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            val result = posts.feed(current.feed, current.city, before = last.createdAt)
            mutableState.update { latest ->
                result.fold(
                    onSuccess = { page ->
                        latest.copy(loadingMore = false, posts = latest.posts + page, canLoadMore = page.size == FEED_PAGE_SIZE)
                    },
                    onFailure = { error -> latest.copy(loadingMore = false, error = error.message) },
                )
            }
        }
    }

    fun toggleLike(post: Post) {
        viewModelScope.launch {
            posts.toggleLike(post).fold(
                onSuccess = { updated -> mutableState.update { it.copy(posts = it.posts.map { old -> if (old.id == updated.id) updated else old }) } },
                onFailure = { error -> mutableState.update { it.copy(error = error.message) } },
            )
        }
    }
}
