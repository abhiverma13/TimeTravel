package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.explore.StarPicker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val MAX_CAPTION_LENGTH = 500

data class ShareUiState(
    val open: Boolean = false,
    val rating: Int = 0,
    val caption: String = "",
    val sharing: Boolean = false,
    val error: String? = null,
    /** Set once the post is saved, for a one-time confirmation. */
    val shared: Boolean = false,
)

/** Shares an itinerary to the feed with a rating and a caption. */
class SharePostViewModel(private val posts: PostRepository, private val itineraryId: String) : ViewModel() {
    private val mutableState = MutableStateFlow(ShareUiState())
    val state: StateFlow<ShareUiState> = mutableState.asStateFlow()

    fun open() = mutableState.update { ShareUiState(open = true) }

    fun dismiss() = mutableState.update { it.copy(open = false) }

    fun onRating(rating: Int) = mutableState.update { it.copy(rating = rating, error = null) }

    fun onCaption(caption: String) = mutableState.update { if (caption.length <= MAX_CAPTION_LENGTH) it.copy(caption = caption) else it }

    fun share() {
        val current = state.value
        if (current.rating == 0) {
            mutableState.update { it.copy(error = "Rate the trip from 1 to 5 stars.") }
            return
        }
        mutableState.update { it.copy(sharing = true, error = null) }
        viewModelScope.launch {
            val result = posts.share(itineraryId, current.rating, current.caption)
            mutableState.update { latest ->
                result.fold(
                    onSuccess = { latest.copy(sharing = false, open = false, shared = true) },
                    onFailure = { error -> latest.copy(sharing = false, error = error.message) },
                )
            }
        }
    }

    fun sharedShown() = mutableState.update { it.copy(shared = false) }
}

/** Rate the trip and add a caption, then share it to the feed. */
@Composable
fun SharePostDialog(state: ShareUiState, viewModel: SharePostViewModel) {
    AlertDialog(
        onDismissRequest = viewModel::dismiss,
        title = { Text("Share this trip") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Your friends, and everyone if your account is public, see a copy of this plan as it is now.",
                    style = MaterialTheme.typography.bodySmall,
                )
                StarPicker(stars = state.rating, onStars = viewModel::onRating)
                OutlinedTextField(
                    value = state.caption,
                    onValueChange = viewModel::onCaption,
                    label = { Text("Caption (optional)") },
                    modifier = Modifier.fillMaxWidth().testTag(TestTags.SHARE_CAPTION_FIELD),
                )
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = viewModel::share, enabled = !state.sharing, modifier = Modifier.testTag(TestTags.SHARE_CONFIRM_BUTTON)) {
                Text(if (state.sharing) "Sharing..." else "Share")
            }
        },
        dismissButton = { TextButton(onClick = viewModel::dismiss) { Text("Cancel") } },
    )
}
