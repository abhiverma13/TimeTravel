package com.example.cpen321application.ui.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Post
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.tripDatesText

private const val MAX_STARS = 5

/** What a post card can ask for. Leaving out `onOpen` makes the card itself not clickable. */
class PostCardActions(val onOpen: (() -> Unit)?, val onOpenAuthor: () -> Unit, val onLike: () -> Unit)

/** A shared trip: who shared it, where and when, their rating and caption, and its likes and comments. */
@Composable
fun PostCard(post: Post, actions: PostCardActions, modifier: Modifier = Modifier) {
    BrandCard(onClick = actions.onOpen, modifier = modifier.fillMaxWidth().testTag(TestTags.POST_CARD)) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 12.dp, end = 8.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                post.author.name,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.clickable(onClick = actions.onOpenAuthor),
            )
            Text(post.city, style = MaterialTheme.typography.titleLarge)
            Text(
                "${tripDatesText(post.startDate, post.endDate)} · ${countText(post.dayCount, "day")} · ${countText(post.stopCount, "stop")}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RatingStars(post.rating)
            if (post.caption.isNotBlank()) {
                Text(post.caption, style = MaterialTheme.typography.bodyMedium)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = actions.onLike, modifier = Modifier.testTag(TestTags.POST_LIKE_BUTTON)) {
                    Icon(
                        if (post.likedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = if (post.likedByMe) "Unlike" else "Like",
                        tint = if (post.likedByMe) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text("${post.likeCount}", style = MaterialTheme.typography.bodyMedium)
                Text(
                    countText(post.commentCount, "comment"),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 16.dp),
                )
            }
        }
    }
}

/** The sharer's rating of the trip, out of five. */
@Composable
fun RatingStars(rating: Int) {
    Row {
        for (star in 1..MAX_STARS) {
            Icon(
                Icons.Filled.Star,
                contentDescription = null,
                tint = if (star <= rating) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** Likes the post if you have not, unlikes it if you have, and returns it with the new count. */
suspend fun PostRepository.toggleLike(post: Post): Result<Post> =
    setLiked(post.id, !post.likedByMe).map { state -> post.copy(likeCount = state.likeCount, likedByMe = state.likedByMe) }
