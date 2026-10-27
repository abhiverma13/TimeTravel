package com.example.cpen321application.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.PostComment
import com.example.cpen321application.data.PostDetail
import com.example.cpen321application.data.PostRepository
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PostUiState(
    val loading: Boolean = true,
    val post: PostDetail? = null,
    val error: String? = null,
    val comments: List<PostComment> = emptyList(),
    val draft: String = "",
    val working: Boolean = false,
    val actionError: String? = null,
    /** Set once the trip is copied, so the screen can open the copy. */
    val copiedItineraryId: String? = null,
    /** Set once the post is deleted, so the screen can close. */
    val deleted: Boolean = false,
)

/** One shared trip in full: its plan, likes and comments, copying it, and deleting it if it is yours. */
class PostViewModel(private val posts: PostRepository, private val postId: String) : ViewModel() {
    private val mutableState = MutableStateFlow(PostUiState())
    val state: StateFlow<PostUiState> = mutableState.asStateFlow()

    init {
        load()
    }

    fun load() {
        mutableState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val post = posts.post(postId)
            val comments = posts.comments(postId)
            mutableState.update { current ->
                post.fold(
                    onSuccess = { detail -> current.copy(loading = false, post = detail, comments = comments.getOrDefault(emptyList())) },
                    onFailure = { error -> current.copy(loading = false, error = error.message) },
                )
            }
        }
    }

    fun toggleLike() {
        val post = state.value.post ?: return
        viewModelScope.launch {
            posts.setLiked(post.id, !post.likedByMe).fold(
                onSuccess = { like -> mutableState.update { it.copy(post = it.post?.copy(likeCount = like.likeCount, likedByMe = like.likedByMe)) } },
                onFailure = { error -> mutableState.update { it.copy(actionError = error.message) } },
            )
        }
    }

    fun onDraftChange(text: String) = mutableState.update { it.copy(draft = text) }

    fun sendComment() {
        val text = state.value.draft.trim()
        if (text.isEmpty()) {
            return
        }
        work(
            call = { posts.comment(postId, text) },
            onDone = { current, comment ->
                current.copy(draft = "", comments = current.comments + comment, post = current.post?.copy(commentCount = current.post.commentCount + 1))
            },
        )
    }

    fun deleteComment(comment: PostComment) = work(
        call = { posts.deleteComment(postId, comment.id) },
        onDone = { current, _ -> current.copy(comments = current.comments - comment, post = current.post?.copy(commentCount = current.post.commentCount - 1)) },
    )

    fun copy(startDate: LocalDate) =
        work(call = { posts.copy(postId, startDate.toString()) }, onDone = { current, copy -> current.copy(copiedItineraryId = copy.id) })

    fun delete() = work(call = { posts.delete(postId) }, onDone = { current, _ -> current.copy(deleted = true) })

    fun copyOpened() = mutableState.update { it.copy(copiedItineraryId = null) }

    private fun <T> work(call: suspend () -> Result<T>, onDone: (PostUiState, T) -> PostUiState) {
        mutableState.update { it.copy(working = true, actionError = null) }
        viewModelScope.launch {
            val result = call()
            mutableState.update { current ->
                result.fold(
                    onSuccess = { value -> onDone(current.copy(working = false), value) },
                    onFailure = { error -> current.copy(working = false, actionError = error.message) },
                )
            }
        }
    }
}
