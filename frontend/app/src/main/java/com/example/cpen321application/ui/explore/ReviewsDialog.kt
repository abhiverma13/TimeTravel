package com.example.cpen321application.ui.explore

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ReviewListItem
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.TestTags

private const val REVIEWS_MAX_HEIGHT_DP = 420

/** An activity's reviews, verified visits first, each verified one with its badge. */
@Composable
fun ReviewsDialog(activity: TravelActivity, reviews: List<ReviewListItem>?, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reviews of ${activity.name}") },
        text = {
            when {
                reviews == null -> CircularProgressIndicator()
                reviews.isEmpty() -> Text("No reviews yet. Be the first to rate it.")
                else -> LazyColumn(modifier = Modifier.heightIn(max = REVIEWS_MAX_HEIGHT_DP.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(reviews, key = { it.id }) { review -> ReviewItem(review) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

@Composable
private fun ReviewItem(review: ReviewListItem) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(review.author, style = MaterialTheme.typography.labelLarge)
            Text("★".repeat(review.rating), color = MaterialTheme.colorScheme.tertiary)
        }
        if (review.verified) {
            Text(
                "✓ VERIFIED VISIT",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.testTag(TestTags.VERIFIED_BADGE),
            )
        }
        if (review.comment.isNotBlank()) {
            Text(review.comment, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
