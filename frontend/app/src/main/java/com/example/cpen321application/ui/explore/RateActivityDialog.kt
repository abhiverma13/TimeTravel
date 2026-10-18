package com.example.cpen321application.ui.explore

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ReviewTags
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.BEST_TIME_LABELS
import com.example.cpen321application.ui.common.COST_LABELS
import com.example.cpen321application.ui.common.SETTING_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags

private const val MAX_STARS = 5
private const val MAX_COMMENT_LENGTH = 500

// Visit lengths a traveller can report, in minutes, with their labels.
private val VISIT_LENGTH_LABELS = listOf(30 to "30 min", 60 to "1 h", 120 to "2 h", 180 to "3 h", 240 to "4 h+")

/** Rate & Review Activity: a 1-5 star rating, an optional comment, and optional structured tags. */
@Composable
fun RateActivityDialog(
    activity: TravelActivity,
    submitting: Boolean,
    error: String?,
    onSubmit: (rating: Int, comment: String, tags: ReviewTags) -> Unit,
    onDismiss: () -> Unit,
) {
    var stars by rememberSaveable(activity.id) { mutableIntStateOf(0) }
    var comment by rememberSaveable(activity.id) { mutableStateOf("") }
    var visitMinutes by rememberSaveable(activity.id) { mutableStateOf<Int?>(null) }
    var bestTime by rememberSaveable(activity.id) { mutableStateOf<String?>(null) }
    var cost by rememberSaveable(activity.id) { mutableStateOf<String?>(null) }
    var setting by rememberSaveable(activity.id) { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rate ${activity.name}") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StarPicker(stars = stars, onStars = { stars = it })
                OutlinedTextField(
                    value = comment,
                    onValueChange = { comment = it.take(MAX_COMMENT_LENGTH) },
                    label = { Text("Review (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                TagChoice("How long you stayed", VISIT_LENGTH_LABELS, visitMinutes) { visitMinutes = it }
                TagChoice("Best time of day", BEST_TIME_LABELS, bestTime) { bestTime = it }
                TagChoice("Indoor or outdoor", SETTING_LABELS, setting) { setting = it }
                TagChoice("Cost", COST_LABELS, cost) { cost = it }
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSubmit(stars, comment, ReviewTags(visitMinutes, bestTime, cost, setting)) },
                enabled = stars > 0 && !submitting,
                modifier = Modifier.testTag(TestTags.SUBMIT_RATING_BUTTON),
            ) {
                Text(if (submitting) "Saving..." else "Submit")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun StarPicker(stars: Int, onStars: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
        for (star in 1..MAX_STARS) {
            IconButton(onClick = { onStars(star) }, modifier = Modifier.testTag(TestTags.ratingStar(star))) {
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = if (star == 1) "1 star" else "$star stars",
                    tint = if (star <= stars) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outlineVariant,
                )
            }
        }
    }
}

// One optional tag: tapping the selected chip again clears it.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> TagChoice(title: String, options: List<Pair<T, String>>, selected: T?, onSelect: (T?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SectionLabel(title)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, label) ->
                FilterChip(
                    selected = value == selected,
                    onClick = { onSelect(if (value == selected) null else value) },
                    label = { Text(label) },
                )
            }
        }
    }
}
