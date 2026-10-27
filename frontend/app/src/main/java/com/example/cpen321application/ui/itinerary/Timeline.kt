package com.example.cpen321application.ui.itinerary

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ItineraryStop
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.common.scoreText

private val GUTTER_WIDTH = 28.dp
private val DOT_TOP = 22.dp
private const val DOT_RADIUS_DP = 6f
private const val DOT_CORE_DP = 2.5f
private const val DOT_SPACING_DP = 4f
private const val LINE_WIDTH_DP = 2f

// The dotted line down the left of a day, with a ringed dot when the row is a stop (like the title slide).
@Composable
private fun TimelineGutter(hasDot: Boolean) {
    val line = MaterialTheme.colorScheme.outline
    val dot = MaterialTheme.colorScheme.secondary
    Canvas(modifier = Modifier.width(GUTTER_WIDTH).fillMaxHeight()) {
        val x = size.width / 2
        drawLine(
            color = line,
            start = Offset(x, 0f),
            end = Offset(x, size.height),
            strokeWidth = LINE_WIDTH_DP.dp.toPx(),
            cap = StrokeCap.Round,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(1f, DOT_SPACING_DP.dp.toPx())),
        )
        if (hasDot) {
            val centre = Offset(x, DOT_TOP.toPx())
            drawCircle(color = dot, radius = DOT_RADIUS_DP.dp.toPx(), center = centre, style = Stroke(width = LINE_WIDTH_DP.dp.toPx()))
            drawCircle(color = dot, radius = DOT_CORE_DP.dp.toPx(), center = centre)
        }
    }
}

/** "14 MIN TRANSIT" between stops, set beside the dotted line. */
@Composable
fun TransitRow(label: String) {
    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        TimelineGutter(hasDot = false)
        SectionLabel(label, modifier = Modifier.padding(vertical = 10.dp).align(Alignment.CenterVertically))
    }
}

/** Something the traveller can do to a stop, offered in the stop's menu. */
data class StopAction(val label: String, val testTag: String, val onClick: () -> Unit)

/** One stop: time, place name in serif, and its score in gold, in a cream card beside the timeline. */
@Composable
fun StopRow(stop: ItineraryStop, actions: List<StopAction> = emptyList()) {
    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        TimelineGutter(hasDot = true)
        BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.ITINERARY_STOP)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "${stop.startTime} to ${stop.endTime}",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(stop.name, style = MaterialTheme.typography.titleMedium)
                    StopDetails(stop)
                }
                if (actions.isNotEmpty()) {
                    StopMenu(stop.name, actions)
                }
            }
        }
    }
}

@Composable
private fun StopMenu(stopName: String, actions: List<StopAction>) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }, modifier = Modifier.testTag(TestTags.STOP_ACTIONS_BUTTON)) {
            Icon(Icons.Filled.MoreVert, contentDescription = "Options for $stopName")
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            actions.forEach { action ->
                DropdownMenuItem(
                    text = { Text(action.label) },
                    onClick = {
                        open = false
                        action.onClick()
                    },
                    modifier = Modifier.testTag(action.testTag),
                )
            }
        }
    }
}

@Composable
private fun StopDetails(stop: ItineraryStop) {
    val gold = MaterialTheme.colorScheme.tertiary
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = gold, fontWeight = FontWeight.Bold)) { append("★ ${scoreText(stop.communityScore)}") }
            withStyle(SpanStyle(color = muted)) {
                append("  " + stop.interests.joinToString(" · ") { interestLabel(it) })
            }
        },
        style = MaterialTheme.typography.bodyMedium,
    )
}

/** A day with no stops still shows the line, with the reason beside it. */
@Composable
fun EmptyDayRow(message: String) {
    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        TimelineGutter(hasDot = false)
        Box(modifier = Modifier.padding(vertical = 12.dp)) {
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
