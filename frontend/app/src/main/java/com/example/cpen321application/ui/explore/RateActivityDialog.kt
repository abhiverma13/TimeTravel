package com.example.cpen321application.ui.explore

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ReviewTags
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.BEST_TIME_LABELS
import com.example.cpen321application.ui.common.COST_LABELS
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoChip
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.SETTING_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.StarGlyph
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Sun

private const val MAX_STARS = 5
private const val MAX_COMMENT_LENGTH = 500
private val StarTarget = 50.dp
private val StarSize = 38.dp

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
    /** Asks for location permission; null when the app already has it. */
    onAllowLocation: (() -> Unit)? = null,
) {
    var stars by rememberSaveable(activity.id) { mutableIntStateOf(0) }
    var comment by rememberSaveable(activity.id) { mutableStateOf("") }
    var visitMinutes by rememberSaveable(activity.id) { mutableStateOf<Int?>(null) }
    var bestTime by rememberSaveable(activity.id) { mutableStateOf<String?>(null) }
    var cost by rememberSaveable(activity.id) { mutableStateOf<String?>(null) }
    var setting by rememberSaveable(activity.id) { mutableStateOf<String?>(null) }

    NeoDialog(
        title = "Rate ${activity.name}",
        onDismissRequest = onDismiss,
        accent = Sun,
        buttons = {
            NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true)
            NeoButton(
                if (submitting) "Saving..." else "Submit",
                onClick = { onSubmit(stars, comment, ReviewTags(visitMinutes, bestTime, cost, setting)) },
                enabled = stars > 0 && !submitting,
                color = Blue,
                compact = true,
                modifier = Modifier.testTag(TestTags.SUBMIT_RATING_BUTTON),
            )
        },
    ) {
        Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            StarPicker(stars = stars, onStars = { stars = it })
            Text(
                "Rating it at the place, on a day it's in your trip? It gets a Verified visit badge and counts double.",
                style = MaterialTheme.typography.bodySmall,
                color = InkSoft,
            )
            if (onAllowLocation != null) {
                NeoButton("Use my location to verify", onClick = onAllowLocation, color = Lime, compact = true)
            }
            TextField(
                value = comment,
                onValueChange = { comment = it.take(MAX_COMMENT_LENGTH) },
                label = { Text("Review (optional)") },
                shape = Neo.FieldShape,
                colors = neoFieldColors(),
                modifier = Modifier.fillMaxWidth().neoField().testTag(TestTags.REVIEW_FIELD),
            )
            TagChoice("How long you stayed", VISIT_LENGTH_LABELS, visitMinutes) { visitMinutes = it }
            TagChoice("Best time of day", BEST_TIME_LABELS, bestTime) { bestTime = it }
            TagChoice("Indoor or outdoor", SETTING_LABELS, setting) { setting = it }
            TagChoice("Cost", COST_LABELS, cost) { cost = it }
            if (error != null) {
                ErrorNote(error)
            }
        }
    }
}

/** Five bold outlined stars to tap; the first `stars` fill sun yellow. */
@Composable
fun StarPicker(stars: Int, onStars: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
        for (star in 1..MAX_STARS) {
            Box(
                modifier = Modifier
                    .size(StarTarget)
                    .clickable(role = Role.Button) { onStars(star) }
                    .testTag(TestTags.ratingStar(star)),
                contentAlignment = Alignment.Center,
            ) {
                val description = if (star == 1) "1 star" else "$star stars"
                StarGlyph(filled = star <= stars, size = StarSize, modifier = Modifier.semantics { contentDescription = description })
            }
        }
    }
}

// One optional tag: tapping the selected chip again clears it.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> TagChoice(title: String, options: List<Pair<T, String>>, selected: T?, onSelect: (T?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionLabel(title, color = Ink)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, label) ->
                NeoChip(
                    label = label,
                    selected = value == selected,
                    onClick = { onSelect(if (value == selected) null else value) },
                    color = Lime,
                )
            }
        }
    }
}
