package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoChip
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.explore.StarPicker
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Pink
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
    /** True for a copied trip whose stops changed: sharing asks whether to link it back to the original. */
    val askLinkBack: Boolean = false,
    /** The traveller's answer to that question, once given. */
    val linkBack: Boolean? = null,
)

/** Shares a trip to the feed with a rating and a caption. */
class SharePostViewModel(private val posts: PostRepository, private val tripId: String) : ViewModel() {
    private val mutableState = MutableStateFlow(ShareUiState())
    val state: StateFlow<ShareUiState> = mutableState.asStateFlow()

    fun open(askLinkBack: Boolean) = mutableState.update { ShareUiState(open = true, askLinkBack = askLinkBack) }

    fun onLinkBack(linkBack: Boolean) = mutableState.update { it.copy(linkBack = linkBack, error = null) }

    fun dismiss() = mutableState.update { it.copy(open = false) }

    fun onRating(rating: Int) = mutableState.update { it.copy(rating = rating, error = null) }

    fun onCaption(caption: String) = mutableState.update { if (caption.length <= MAX_CAPTION_LENGTH) it.copy(caption = caption) else it }

    fun share() {
        val current = state.value
        if (current.rating == 0) {
            mutableState.update { it.copy(error = "Rate the trip from 1 to 5 stars.") }
            return
        }
        if (current.askLinkBack && current.linkBack == null) {
            mutableState.update { it.copy(error = "Choose whether to link back to the original trip.") }
            return
        }
        mutableState.update { it.copy(sharing = true, error = null) }
        viewModelScope.launch {
            val result = posts.share(tripId, current.rating, current.caption, current.linkBack.takeIf { current.askLinkBack })
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

// For a copied trip that was changed: on the feed, a linked trip shows the original's stops on its card (the changes
// stay on the traveller's own profile); an unlinked one gets a card of its own.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkBackChoice(linkBack: Boolean?, onChoose: (Boolean) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag(TestTags.SHARE_LINK_CHOICE)) {
        Text("Link back to the original?", style = MaterialTheme.typography.titleSmall, color = Ink)
        Text(
            "You changed this trip after copying it. Linked, the feed shows the original's plan with your rating; your changes stay on your profile.",
            style = MaterialTheme.typography.bodySmall,
            color = Ink,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            NeoChip("Yes, link it", selected = linkBack == true, onClick = { onChoose(true) }, modifier = Modifier.testTag(TestTags.SHARE_LINK_YES))
            NeoChip(
                "No, share it alone",
                selected = linkBack == false,
                onClick = { onChoose(false) },
                modifier = Modifier.testTag(TestTags.SHARE_LINK_NO),
            )
        }
    }
}

/** Rate the trip and add a caption, then share it to the feed. */
@Composable
fun SharePostDialog(state: ShareUiState, viewModel: SharePostViewModel) {
    NeoDialog(
        title = "Share this trip",
        onDismissRequest = viewModel::dismiss,
        accent = Pink,
        buttons = {
            NeoButton("Cancel", onClick = viewModel::dismiss, color = Card, compact = true)
            NeoButton(
                if (state.sharing) "Sharing..." else "Share",
                onClick = viewModel::share,
                enabled = !state.sharing,
                color = Blue,
                compact = true,
                modifier = Modifier.testTag(TestTags.SHARE_CONFIRM_BUTTON),
            )
        },
    ) {
        Text(
            "Your friends, and everyone if your account is public, see a copy of this plan as it is now.",
            style = MaterialTheme.typography.bodySmall,
            color = Ink,
        )
        StarPicker(stars = state.rating, onStars = viewModel::onRating)
        if (state.askLinkBack) {
            LinkBackChoice(state.linkBack, viewModel::onLinkBack)
        }
        TextField(
            value = state.caption,
            onValueChange = viewModel::onCaption,
            label = { Text("Caption (optional)") },
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            modifier = Modifier.fillMaxWidth().neoField().testTag(TestTags.SHARE_CAPTION_FIELD),
        )
        state.error?.let { ErrorNote(it) }
    }
}
