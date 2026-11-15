package com.example.cpen321application.ui.explore

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ReviewListItem
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoStars
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Sky

private const val REVIEWS_MAX_HEIGHT_DP = 420
private const val VERIFIED_TILT = -2f

/** An activity's reviews, verified visits first, each verified one with its badge. */
@Composable
fun ReviewsDialog(activity: TravelActivity, reviews: List<ReviewListItem>?, onDismiss: () -> Unit) {
    NeoDialog(
        title = "Reviews of ${activity.name}",
        onDismissRequest = onDismiss,
        accent = Sky,
        buttons = { NeoButton("Close", onClick = onDismiss, color = Card, compact = true) },
    ) {
        when {
            reviews == null -> NeoLoader()
            reviews.isEmpty() -> EmptyNote("No reviews yet. Be the first to rate it.")
            else -> LazyColumn(modifier = Modifier.heightIn(max = REVIEWS_MAX_HEIGHT_DP.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                items(reviews, key = { it.id }) { review -> ReviewItem(review) }
            }
        }
    }
}

@Composable
private fun ReviewItem(review: ReviewListItem) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SquareAvatar(review.author, size = 36.dp)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(review.author, style = MaterialTheme.typography.titleSmall, color = Ink)
                NeoStars(review.rating, size = 14.dp)
            }
            if (review.verified) {
                Sticker("✓ VERIFIED VISIT", color = Lime, tilt = VERIFIED_TILT, modifier = Modifier.testTag(TestTags.VERIFIED_BADGE))
            }
            if (review.comment.isNotBlank()) {
                Text(review.comment, style = MaterialTheme.typography.bodyMedium, color = Ink)
            }
        }
    }
}
