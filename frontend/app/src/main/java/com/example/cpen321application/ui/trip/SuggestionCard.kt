package com.example.cpen321application.ui.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ProposedDay
import com.example.cpen321application.data.Suggestion
import com.example.cpen321application.data.TripDay
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.Tag
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.PinkWash
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.ENGLISH)
private const val HEADS_UP_TILT = -2f
private const val NEW_TILT = 3f
private val TimeColumn = 104.dp

/** How a stop of the day changes if the suggestion is accepted. */
enum class PreviewChange { KEPT, MOVED, NEW, REMOVED }

/** One line of the preview: a stop as it would be (or, if removed, as it was), and what changed. */
data class PreviewRow(val name: String, val startTime: String, val endTime: String, val change: PreviewChange, val wasAt: String? = null)

/**
 * The day as it would be, compared with the day as it is: every stop of either, in time order, marked new, moved
 * (with its old start), removed, or kept.
 */
fun previewRows(current: TripDay?, proposed: ProposedDay): List<PreviewRow> {
    val before = current?.stops.orEmpty().associateBy { it.activityId }
    val after = proposed.stops.map { stop ->
        val old = before[stop.activityId]
        when {
            old == null -> PreviewRow(stop.name, stop.startTime, stop.endTime, PreviewChange.NEW)
            old.startTime != stop.startTime -> PreviewRow(stop.name, stop.startTime, stop.endTime, PreviewChange.MOVED, wasAt = old.startTime)
            else -> PreviewRow(stop.name, stop.startTime, stop.endTime, PreviewChange.KEPT)
        }
    }
    val staying = proposed.stops.map { it.activityId }.toSet()
    val removed = current?.stops.orEmpty()
        .filter { it.activityId !in staying }
        .map { PreviewRow(it.name, it.startTime, it.endTime, PreviewChange.REMOVED) }
    return (after + removed).sortedBy { it.startTime }
}

/**
 * A change proposed after a disruption, as a yellow heads-up block. It shows the day as it would be next to the day as
 * it is, so members see exactly what changes before they accept or decline; nothing changes until someone accepts.
 */
@Composable
fun SuggestionCard(suggestion: Suggestion, currentDay: TripDay?, onAccept: () -> Unit, onDecline: () -> Unit) {
    val rain = suggestion.reason == "rain"
    NeoCard(
        color = Sun,
        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp).testTag(TestTags.SUGGESTION_CARD),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Sticker("HEADS UP", color = Ink, tilt = HEADS_UP_TILT)
                    Text(if (rain) "Rain on the way" else "Venue closed", style = MaterialTheme.typography.headlineMedium, color = Ink)
                }
                Box(
                    Modifier.size(48.dp).neoBlock(Neo.ButtonShape, Card, Neo.SmallShadow, Neo.SmallShadow),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(if (rain) Icons.Filled.WaterDrop else Icons.Filled.Block, contentDescription = null, tint = Ink)
                }
            }
            Text(suggestion.message, style = MaterialTheme.typography.bodyLarge, color = Ink)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .neoBlock(Neo.ButtonShape, Card, 0.dp, 0.dp, border = Neo.ThinBorder)
                    .padding(10.dp)
                    .testTag(TestTags.SUGGESTION_PREVIEW),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    "${LocalDate.parse(suggestion.date).format(DAY_FORMAT)} if you accept",
                    style = MaterialTheme.typography.labelMedium,
                    color = Ink,
                    modifier = Modifier.padding(start = 4.dp, bottom = 4.dp),
                )
                previewRows(currentDay, suggestion.proposedDay).forEach { row -> PreviewLine(row) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 4.dp)) {
                NeoButton("Accept", onClick = onAccept, color = Blue, modifier = Modifier.weight(1f).testTag(TestTags.SUGGESTION_ACCEPT_BUTTON))
                NeoButton("Decline", onClick = onDecline, color = Card, modifier = Modifier.weight(1f).testTag(TestTags.SUGGESTION_DECLINE_BUTTON))
            }
        }
    }
}

// One stop of the preview: removed stops are struck through, new ones sit on a pink highlight with a pink sticker.
@Composable
private fun PreviewLine(row: PreviewRow) {
    val removed = row.change == PreviewChange.REMOVED
    val strike = if (removed) TextDecoration.LineThrough else null
    val ink = if (removed) InkSoft else Ink
    val highlight = if (row.change == PreviewChange.NEW) PinkWash else Color.Transparent
    Row(
        modifier = Modifier.fillMaxWidth().background(highlight, Neo.TagShape).padding(horizontal = 4.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "${row.startTime} to ${row.endTime}",
            style = MaterialTheme.typography.labelSmall,
            color = ink,
            textDecoration = strike,
            modifier = Modifier.width(TimeColumn),
        )
        Text(row.name, style = MaterialTheme.typography.bodyMedium, color = ink, textDecoration = strike, modifier = Modifier.weight(1f))
        when (row.change) {
            PreviewChange.NEW -> Sticker("New", color = Pink, tilt = NEW_TILT)
            PreviewChange.MOVED -> Tag("Was ${row.wasAt}", color = Sky)
            PreviewChange.REMOVED -> Tag("Removed", color = Ink)
            PreviewChange.KEPT -> Unit
        }
    }
}
