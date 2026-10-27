package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.FEED_EVERYONE
import com.example.cpen321application.data.FEED_FRIENDS

private val FEEDS = listOf(FEED_FRIENDS to "Friends", FEED_EVERYONE to "Everyone")

/** The Feed tab: trips shared by friends, or by everyone who shares publicly. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(viewModel: FeedViewModel, onOpenPost: (String) -> Unit, onOpenTraveller: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }
    Scaffold(topBar = { TopAppBar(title = { Text("Feed") }) }) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { FeedChoice(state.feed, viewModel::selectFeed) }
            item { CityFilter(state.cityInput, viewModel::onCityInputChange, viewModel::applyCity) }
            state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
            when {
                state.loading -> item { CircularProgressIndicator() }
                state.posts.isEmpty() -> item { EmptyFeed(state) }
                else -> items(state.posts, key = { it.id }) { post ->
                    PostCard(
                        post,
                        PostCardActions(
                            onOpen = { onOpenPost(post.id) },
                            onOpenAuthor = { onOpenTraveller(post.author.id) },
                            onLike = { viewModel.toggleLike(post) },
                        ),
                    )
                }
            }
            if (state.canLoadMore && !state.loading) {
                item {
                    TextButton(onClick = viewModel::loadMore, enabled = !state.loadingMore, modifier = Modifier.fillMaxWidth()) {
                        Text(if (state.loadingMore) "Loading..." else "Load more")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedChoice(feed: String, onSelect: (String) -> Unit) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        FEEDS.forEachIndexed { index, (value, label) ->
            SegmentedButton(
                selected = feed == value,
                onClick = { onSelect(value) },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = FEEDS.size),
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun CityFilter(text: String, onChange: (String) -> Unit, onApply: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = text,
            onValueChange = onChange,
            label = { Text("City (optional)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onApply() }),
            modifier = Modifier.weight(1f),
        )
        OutlinedButton(onClick = onApply, shape = MaterialTheme.shapes.small) { Text("Filter") }
    }
}

@Composable
private fun EmptyFeed(state: FeedUiState) {
    val where = if (state.city.isBlank()) "" else " in ${state.city}"
    val text = if (state.feed == FEED_FRIENDS) {
        "Nothing from your friends$where yet. Add friends from your Profile, or share one of your trips from its itinerary."
    } else {
        "No shared trips$where yet. Share one of yours from its itinerary."
    }
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
