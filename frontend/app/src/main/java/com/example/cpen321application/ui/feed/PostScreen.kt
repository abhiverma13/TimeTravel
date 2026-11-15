package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
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
import com.example.cpen321application.data.TripStop
import com.example.cpen321application.data.PostComment
import com.example.cpen321application.data.PostDay
import com.example.cpen321application.data.PostDetail
import com.example.cpen321application.data.PostTrip
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.ErrorInk
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.trip.SpineCap
import com.example.cpen321application.ui.trip.StopRow
import com.example.cpen321application.ui.trip.TransitRow
import com.example.cpen321application.ui.builder.StartDateDialog
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMM d")
private const val MAX_COMMENT_LENGTH = 300
private const val DAY_TILT = -2f

/** Where a post screen can send the traveller. */
class PostNavigation(
    val onBack: () -> Unit,
    val onOpenTraveller: (String) -> Unit,
    val onOpenTrip: (String) -> Unit,
    val onOpenTakers: (String) -> Unit,
)

/** One shared trip: the plan, its likes and comments, and copying it into your own trips. */
@Composable
fun PostScreen(viewModel: PostViewModel, navigation: PostNavigation) {
    val state by viewModel.state.collectAsState()
    var pickingDate by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    LaunchedEffect(state.copiedTripId) {
        state.copiedTripId?.let { tripId ->
            viewModel.copyOpened()
            navigation.onOpenTrip(tripId)
        }
    }
    LaunchedEffect(state.deleted) { if (state.deleted) navigation.onBack() }
    Scaffold(
        topBar = {
            NeoTopBar(title = "Shared trip", onBack = navigation.onBack) {
                if (state.post?.mine == true) NeoButton("Delete", onClick = { confirmingDelete = true }, color = ErrorWash, compact = true)
            }
        },
    ) { innerPadding ->
        val post = state.post
        when {
            post != null -> PostContent(post, state, viewModel, navigation, Modifier.padding(innerPadding), onCopy = { pickingDate = true })
            state.loading -> Box(Modifier.padding(innerPadding).fillMaxSize(), contentAlignment = Alignment.Center) { NeoLoader() }
            else -> Column(Modifier.padding(innerPadding).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                ErrorNote(state.error ?: "Post not found")
                NeoButton("Try again", onClick = viewModel::load, color = Card, compact = true)
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
        NeoDialog(
            title = "Delete this post?",
            onDismissRequest = { confirmingDelete = false },
            accent = ErrorWash,
            buttons = {
                NeoButton("Cancel", onClick = { confirmingDelete = false }, color = Card, compact = true)
                NeoButton("Delete", onClick = {
                    confirmingDelete = false
                    viewModel.delete()
                }, color = ErrorInk, compact = true)
            },
        ) {
            Text("It and its comments disappear from the feed. Your trip is not affected.", style = MaterialTheme.typography.bodyMedium, color = Ink)
        }
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
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
    ) {
        item {
            val actions = PostCardActions(
                onOpen = null,
                onOpenAuthor = { navigation.onOpenTraveller(post.author.id) },
                onLike = viewModel::toggleLike,
                onOpenTakers = navigation.onOpenTakers,
            )
            PostCard(post.summary(), actions)
        }
        item {
            NeoButton(
                "Copy to my trips",
                onClick = onCopy,
                enabled = !state.working,
                color = Blue,
                icon = Icons.Filled.ContentCopy,
                modifier = Modifier.padding(top = 18.dp).fillMaxWidth().testTag(TestTags.POST_COPY_BUTTON),
            )
        }
        state.actionError?.let { error -> item { ErrorNote(error, modifier = Modifier.padding(top = 12.dp)) } }
        post.trip.days.forEachIndexed { index, day -> postDay(index, post.trip, day) }
        item { SectionHeader("Comments (${post.commentCount})", Pink, modifier = Modifier.padding(top = 28.dp, bottom = 8.dp)) }
        items(state.comments, key = { it.id }) { comment ->
            CommentRow(comment, canDelete = comment.mine || post.mine, onDelete = { viewModel.deleteComment(comment) })
        }
        item { CommentInput(state.draft, state.working, viewModel::onDraftChange, viewModel::sendComment) }
    }
}

// A read-only day of the shared plan, drawn on the same spine as the trip's timeline.
private fun LazyListScope.postDay(index: Int, trip: PostTrip, day: PostDay) {
    item(key = "day-${day.date}") {
        Sticker(
            "Day ${index + 1} of ${trip.days.size} · ${LocalDate.parse(day.date).format(DAY_FORMAT)}".uppercase(),
            color = Ink,
            tilt = DAY_TILT,
            modifier = Modifier.padding(top = 26.dp, bottom = 8.dp),
        )
    }
    itemsIndexed(day.stops, key = { _, stop -> "${day.date}-${stop.activityId}" }) { stopIndex, stop ->
        val travel = when {
            stop.travelMinutes == 0 -> "Next door"
            stopIndex == 0 -> "${stop.travelMinutes} min from ${trip.lodging}"
            else -> "${stop.travelMinutes} min ${trip.transportMode}"
        }
        TransitRow(travel, mode = trip.transportMode, cap = if (stopIndex == 0) SpineCap.START else SpineCap.NONE)
        StopRow(
            TripStop(
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
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 8.dp)) {
        SquareAvatar(comment.author.name, size = 36.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(comment.author.name, style = MaterialTheme.typography.titleSmall, color = Ink)
            Text(comment.text, style = MaterialTheme.typography.bodyMedium, color = Ink)
        }
        if (canDelete) {
            NeoButton("Remove", onClick = onDelete, color = Card, compact = true)
        }
    }
}

@Composable
private fun CommentInput(draft: String, working: Boolean, onChange: (String) -> Unit, onSend: () -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(top = 12.dp),
    ) {
        TextField(
            value = draft,
            onValueChange = { if (it.length <= MAX_COMMENT_LENGTH) onChange(it) },
            label = { Text("Add a comment") },
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            modifier = Modifier.weight(1f).neoField().testTag(TestTags.COMMENT_FIELD),
        )
        NeoButton(
            "Send",
            onClick = onSend,
            enabled = draft.isNotBlank() && !working,
            color = Blue,
            modifier = Modifier.testTag(TestTags.COMMENT_SEND_BUTTON),
        )
    }
}
