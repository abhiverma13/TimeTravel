package com.example.cpen321application.ui.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.AppNotification
import com.example.cpen321application.data.FEED_EVERYONE
import com.example.cpen321application.data.FEED_FRIENDS
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoSegmented
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.NewDot
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.PinkWash

private val FEEDS = listOf(FEED_FRIENDS to "Friends", FEED_EVERYONE to "Everyone")

/** The Feed tab: trips shared by friends, or by everyone who shares publicly. */
@Composable
fun FeedScreen(
    viewModel: FeedViewModel,
    onOpenPost: (String) -> Unit,
    onOpenTraveller: (String) -> Unit,
    onOpenTakers: (String) -> Unit,
    newOnYourPosts: List<AppNotification> = emptyList(),
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }
    Scaffold(topBar = { NeoTopBar(title = "Feed", accent = Pink) }) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (newOnYourPosts.isNotEmpty()) {
                item { NewOnYourPosts(newOnYourPosts, onOpenPost) }
            }
            item { NeoSegmented(FEEDS, state.feed, viewModel::selectFeed) }
            item { CityFilter(state.cityInput, viewModel::onCityInputChange, viewModel::applyCity) }
            state.error?.let { error -> item { ErrorNote(error) } }
            when {
                state.loading -> item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { NeoLoader() } }
                state.posts.isEmpty() -> item { EmptyFeed(state) }
                else -> items(state.posts, key = { it.id }) { post ->
                    PostCard(
                        post,
                        PostCardActions(
                            onOpen = { onOpenPost(post.id) },
                            onOpenAuthor = { onOpenTraveller(post.author.id) },
                            onLike = { viewModel.toggleLike(post) },
                            onOpenTakers = onOpenTakers,
                        ),
                    )
                }
            }
            if (state.canLoadMore && !state.loading) {
                item {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        NeoButton(
                            if (state.loadingMore) "Loading..." else "Load more",
                            onClick = viewModel::loadMore,
                            enabled = !state.loadingMore,
                            color = Card,
                        )
                    }
                }
            }
        }
    }
}

// Likes and comments on the traveller's own posts since they last opened the Feed; each opens its post.
@Composable
private fun NewOnYourPosts(notifications: List<AppNotification>, onOpenPost: (String) -> Unit) {
    NeoCard(color = PinkWash, modifier = Modifier.fillMaxWidth().testTag(TestTags.FEED_NEW_ON_POSTS)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel("New on your posts", color = Ink)
            notifications.forEach { notification ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().clickable(enabled = notification.postId != null) {
                        notification.postId?.let(onOpenPost)
                    },
                ) {
                    NewDot()
                    Text(notification.text, style = MaterialTheme.typography.titleSmall, color = Ink)
                }
            }
        }
    }
}

@Composable
private fun CityFilter(text: String, onChange: (String) -> Unit, onApply: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        TextField(
            value = text,
            onValueChange = onChange,
            label = { Text("City (optional)") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onApply() }),
            modifier = Modifier.weight(1f).neoField(),
        )
        NeoButton("Filter", onClick = onApply, color = Card, modifier = Modifier.height(56.dp))
    }
}

@Composable
private fun EmptyFeed(state: FeedUiState) {
    val where = if (state.city.isBlank()) "" else " in ${state.city}"
    val text = if (state.feed == FEED_FRIENDS) {
        "Nothing from your friends$where yet. Add friends from your Profile, or share one of your trips."
    } else {
        "No shared trips$where yet. Share one of yours from its page."
    }
    EmptyNote(text)
}
