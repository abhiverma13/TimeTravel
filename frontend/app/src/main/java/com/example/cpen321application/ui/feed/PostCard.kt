package com.example.cpen321application.ui.feed

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoHeart
import com.example.cpen321application.ui.common.NeoStars
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.avatarColor
import com.example.cpen321application.ui.common.highlighter
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.common.scoreText
import com.example.cpen321application.ui.common.tripDatesText
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime

private const val TAKEN_TILT = -1.5f
private const val HEART_POP = 1.4f

/** What a post card can ask for. Leaving out `onOpen` makes the card itself not clickable. */
class PostCardActions(
    val onOpen: (() -> Unit)?,
    val onOpenAuthor: () -> Unit,
    val onLike: () -> Unit,
    /** Opens everyone who took the trip, given the id of the trip's original post. */
    val onOpenTakers: (String) -> Unit = {},
)

/** A shared trip as a chunky card: who shared it, the city big, their stars, a lime sticker if others took it, and likes. */
@Composable
fun PostCard(post: Post, actions: PostCardActions, modifier: Modifier = Modifier) {
    NeoCard(onClick = actions.onOpen, modifier = modifier.fillMaxWidth().testTag(TestTags.POST_CARD)) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SquareAvatar(post.author.name, size = 34.dp)
                Text(
                    post.author.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = Ink,
                    modifier = Modifier.weight(1f).clickable(onClick = actions.onOpenAuthor),
                )
                NeoStars(post.rating, size = 17.dp)
            }
            Box(Modifier.padding(top = 6.dp, start = 4.dp)) {
                // The city sits on a highlighter in the sharer's own colour, the colour of their square.
                Text(
                    post.city,
                    style = MaterialTheme.typography.displaySmall,
                    color = Ink,
                    modifier = Modifier.highlighter(avatarColor(post.author.name)),
                )
            }
            Text(
                "${tripDatesText(post.startDate, post.endDate)} · ${countText(post.dayCount, "day")} · ${countText(post.stopCount, "stop")}",
                style = MaterialTheme.typography.labelMedium,
                color = InkSoft,
            )
            TakenBy(post, actions.onOpenTakers)
            if (post.caption.isNotBlank()) {
                Text(post.caption, style = MaterialTheme.typography.bodyLarge, color = Ink)
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().height(Neo.Border).background(Ink))
        LikeRow(post, actions.onLike)
    }
}

// The big heart (which pops when liked), the like count, and the comment count.
@Composable
private fun LikeRow(post: Post, onLike: () -> Unit) {
    val pop = remember { Animatable(1f) }
    var wasLiked by remember { mutableStateOf(post.likedByMe) }
    LaunchedEffect(post.likedByMe) {
        val justLiked = post.likedByMe && !wasLiked
        wasLiked = post.likedByMe
        if (justLiked) {
            pop.snapTo(HEART_POP)
            pop.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = 500f))
        }
    }
    Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        val description = if (post.likedByMe) "Unlike" else "Like"
        Box(
            modifier = Modifier
                .size(52.dp)
                .clickable(role = Role.Button, onClick = onLike)
                .semantics { contentDescription = description }
                .testTag(TestTags.POST_LIKE_BUTTON),
            contentAlignment = Alignment.Center,
        ) {
            NeoHeart(
                filled = post.likedByMe,
                size = 32.dp,
                modifier = Modifier.graphicsLayer {
                    scaleX = pop.value
                    scaleY = pop.value
                },
            )
        }
        Text("${post.likeCount}", style = MaterialTheme.typography.titleMedium, color = Ink)
        Spacer(Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Outlined.Chat, contentDescription = null, tint = Ink, modifier = Modifier.size(20.dp))
        Text(
            countText(post.commentCount, "comment"),
            style = MaterialTheme.typography.labelMedium,
            color = Ink,
            modifier = Modifier.padding(start = 6.dp, end = 8.dp),
        )
    }
}

// On a merged card: its planner, how many travellers took the trip and their average rating. On a copy linked to an
// original (in a traveller's own posts): whose trip it was. Either opens everyone who took it, from a lime sticker.
@Composable
private fun TakenBy(post: Post, onOpenTakers: (String) -> Unit) {
    val text = when {
        post.original != null -> "Took ${post.original.planner.name}'s trip"
        post.takenBy > 1 -> "Planned by ${post.author.name} · taken by ${post.takenBy} travellers · ${scoreText(post.averageRating)} ★ average"
        else -> return
    }
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = Ink,
        modifier = Modifier
            .padding(vertical = 4.dp)
            .rotate(TAKEN_TILT)
            .neoBlock(Neo.TagShape, Lime, Neo.SmallShadow, Neo.SmallShadow, border = Neo.ThinBorder)
            .clickable { onOpenTakers(post.original?.postId ?: post.id) }
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .testTag(TestTags.POST_TAKEN_BY),
    )
}

/** The sharer's rating of the trip, out of five, as bold outlined stars. */
@Composable
fun RatingStars(rating: Int) {
    NeoStars(rating, size = 18.dp)
}

/** Likes the post if you have not, unlikes it if you have, and returns it with the new count. */
suspend fun PostRepository.toggleLike(post: Post): Result<Post> =
    setLiked(post.id, !post.likedByMe).map { state -> post.copy(likeCount = state.likeCount, likedByMe = state.likedByMe) }
