package com.example.cpen321application.ui.trip

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.ENGLISH)

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
 * A change proposed after a disruption. It shows the day as it would be next to the day as it is, so members see exactly
 * what changes before they accept or decline; nothing changes until someone accepts.
 */
@Composable
fun SuggestionCard(suggestion: Suggestion, currentDay: TripDay?, onAccept: () -> Unit, onDecline: () -> Unit) {
    BrandCard(
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).testTag(TestTags.SUGGESTION_CARD),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel(if (suggestion.reason == "rain") "Rain on the way" else "Venue closed")
            Text(suggestion.message, style = MaterialTheme.typography.bodyLarge)
            Column(modifier = Modifier.testTag(TestTags.SUGGESTION_PREVIEW), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "${LocalDate.parse(suggestion.date).format(DAY_FORMAT)} if you accept",
                    style = MaterialTheme.typography.titleSmall,
                )
                previewRows(currentDay, suggestion.proposedDay).forEach { row -> PreviewLine(row) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAccept, shape = MaterialTheme.shapes.small, modifier = Modifier.testTag(TestTags.SUGGESTION_ACCEPT_BUTTON)) {
                    Text("Accept")
                }
                TextButton(onClick = onDecline, modifier = Modifier.testTag(TestTags.SUGGESTION_DECLINE_BUTTON)) { Text("Decline") }
            }
        }
    }
}

@Composable
private fun PreviewLine(row: PreviewRow) {
    val removed = row.change == PreviewChange.REMOVED
    val (label, labelColor) = when (row.change) {
        PreviewChange.NEW -> "New" to MaterialTheme.colorScheme.primary
        PreviewChange.MOVED -> "Was ${row.wasAt}" to MaterialTheme.colorScheme.onSurfaceVariant
        PreviewChange.REMOVED -> "Removed" to MaterialTheme.colorScheme.error
        PreviewChange.KEPT -> "" to Color.Unspecified
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${row.startTime} to ${row.endTime}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textDecoration = if (removed) TextDecoration.LineThrough else null,
            modifier = Modifier.width(104.dp),
        )
        Text(
            row.name,
            style = MaterialTheme.typography.bodyMedium,
            textDecoration = if (removed) TextDecoration.LineThrough else null,
            modifier = Modifier.weight(1f),
        )
        if (label.isNotEmpty()) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = labelColor)
        }
    }
}
