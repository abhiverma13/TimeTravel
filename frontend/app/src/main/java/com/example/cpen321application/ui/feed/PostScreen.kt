package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.GeoPoint
import com.example.cpen321application.data.ItineraryStop
import com.example.cpen321application.data.PostComment
import com.example.cpen321application.data.PostDay
import com.example.cpen321application.data.PostDetail
import com.example.cpen321application.data.PostTrip
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.itinerary.StopRow
import com.example.cpen321application.ui.itinerary.TransitRow
import com.example.cpen321application.ui.trip.StartDateDialog
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMM d")
private const val MAX_COMMENT_LENGTH = 300

/** Where a post screen can send the traveller. */
class PostNavigation(val onBack: () -> Unit, val onOpenTraveller: (String) -> Unit, val onOpenItinerary: (String) -> Unit)

/** One shared trip: the plan, its likes and comments, and copying it into your own trips. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostScreen(viewModel: PostViewModel, navigation: PostNavigation) {
    val state by viewModel.state.collectAsState()
    var pickingDate by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    LaunchedEffect(state.copiedItineraryId) {
        state.copiedItineraryId?.let { itineraryId ->
            viewModel.copyOpened()
            navigation.onOpenItinerary(itineraryId)
        }
    }
    LaunchedEffect(state.deleted) { if (state.deleted) navigation.onBack() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Shared trip") },
                navigationIcon = { IconButton(onClick = navigation.onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                actions = { if (state.post?.mine == true) TextButton(onClick = { confirmingDelete = true }) { Text("Delete") } },
            )
        },
    ) { innerPadding ->
        val post = state.post
        when {
            post != null -> PostContent(post, state, viewModel, navigation, Modifier.padding(innerPadding), onCopy = { pickingDate = true })
            state.loading -> CircularProgressIndicator(modifier = Modifier.padding(innerPadding).padding(20.dp))
            else -> Column(Modifier.padding(innerPadding).padding(20.dp)) {
                Text(state.error ?: "Post not found", color = MaterialTheme.colorScheme.error)
                TextButton(onClick = viewModel::load) { Text("Try again") }
            }
        }
    }
    if (pickingDate) {
        StartDateDialog(
            title = "Your first day",
            onConfirm = { date: LocalDate ->
                pickingDate = false
                viewModel.copy(date)
            },
            onDismiss = { pickingDate = false },
        )
    }
    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete this post?") },
            text = { Text("It and its comments disappear from the feed. Your itinerary is not affected.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.delete()
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun PostContent(
    post: PostDetail,
    state: PostUiState,
    viewModel: PostViewModel,
    navigation: PostNavigation,
    modifier: Modifier,
    onCopy: () -> Unit,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            PostCard(post.summary(), PostCardActions(onOpen = null, onOpenAuthor = { navigation.onOpenTraveller(post.author.id) }, onLike = viewModel::toggleLike))
        }
        item {
            Button(
                onClick = onCopy,
                enabled = !state.working,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth().testTag(TestTags.POST_COPY_BUTTON),
            ) { Text("Copy to my trips") }
        }
        state.actionError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
        post.trip.days.forEachIndexed { index, day -> postDay(index, post.trip, day) }
        item { SectionLabel("Comments (${post.commentCount})", modifier = Modifier.padding(top = 16.dp)) }
        items(state.comments, key = { it.id }) { comment ->
            CommentRow(comment, canDelete = comment.mine || post.mine, onDelete = { viewModel.deleteComment(comment) })
        }
        item { CommentInput(state.draft, state.working, viewModel::onDraftChange, viewModel::sendComment) }
    }
}

// A read-only day of the shared plan, drawn like the itinerary's timeline.
private fun LazyListScope.postDay(index: Int, trip: PostTrip, day: PostDay) {
    item(key = "day-${day.date}") {
        SectionLabel("Day ${index + 1} of ${trip.days.size} · ${LocalDate.parse(day.date).format(DAY_FORMAT)}", modifier = Modifier.padding(top = 12.dp))
    }
    itemsIndexed(day.stops, key = { _, stop -> "${day.date}-${stop.activityId}" }) { stopIndex, stop ->
        val travel = when {
            stop.travelMinutes == 0 -> "Next door"
            stopIndex == 0 -> "${stop.travelMinutes} min from ${trip.lodging}"
            else -> "${stop.travelMinutes} min ${trip.transportMode}"
        }
        TransitRow(travel)
        StopRow(
            ItineraryStop(
                activityId = stop.activityId,
                name = stop.name,
                address = "",
                location = GeoPoint(0.0, 0.0),
                interests = stop.interests,
                startTime = stop.startTime,
                endTime = stop.endTime,
                travelMinutes = stop.travelMinutes,
                communityScore = stop.communityScore,
                locked = false,
                visited = false,
            ),
        )
    }
}

@Composable
private fun CommentRow(comment: PostComment, canDelete: Boolean, onDelete: () -> Unit) {
    Row(verticalAlignment = Alignment.Top) {
        Column(modifier = Modifier.weight(1f).padding(vertical = 4.dp)) {
            Text(comment.author.name, style = MaterialTheme.typography.labelLarge)
            Text(comment.text, style = MaterialTheme.typography.bodyMedium)
        }
        if (canDelete) {
            TextButton(onClick = onDelete) { Text("Delete") }
        }
    }
}

@Composable
private fun CommentInput(draft: String, working: Boolean, onChange: (String) -> Unit, onSend: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = draft,
            onValueChange = { if (it.length <= MAX_COMMENT_LENGTH) onChange(it) },
            label = { Text("Add a comment") },
            modifier = Modifier.weight(1f).testTag(TestTags.COMMENT_FIELD),
        )
        Button(
            onClick = onSend,
            enabled = draft.isNotBlank() && !working,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.testTag(TestTags.COMMENT_SEND_BUTTON),
        ) { Text("Send") }
    }
}
