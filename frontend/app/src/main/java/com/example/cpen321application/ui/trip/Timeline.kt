package com.example.cpen321application.ui.trip

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.DirectionsTransit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TripStop
import com.example.cpen321application.ui.common.CategoryTag
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoIconButton
import com.example.cpen321application.ui.common.NeoMenu
import com.example.cpen321application.ui.common.StarGlyph
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.categoryColor
import com.example.cpen321application.ui.common.inkOn
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.common.scoreText
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime

private val GutterWidth = 38.dp
private val SpineX = 13.dp
private val SpineWidth = 4.dp
private val NodeSize = 18.dp
private val BandHeight = 46.dp
private val CardTop = 4.dp
private val CapSize = 14.dp
private val DashOn = 7.dp
private val DashOff = 6.dp

/** Where a timeline row sits on the day: the first leg starts the spine, the trip home ends it. */
enum class SpineCap { NONE, START, END }

// The thick black spine down the left of a day: solid beside a stop, dashed along a travel leg, with a square node in
// the stop's colour, and an ink cap where the day leaves and returns to the lodging.
@Composable
private fun Spine(dashed: Boolean, cap: SpineCap = SpineCap.NONE, node: Color? = null) {
    Canvas(modifier = Modifier.width(GutterWidth).fillMaxHeight()) {
        val x = SpineX.toPx()
        val middle = size.height / 2
        val top = if (cap == SpineCap.START) middle else 0f
        val bottom = if (cap == SpineCap.END) middle else size.height
        val dash = PathEffect.dashPathEffect(floatArrayOf(DashOn.toPx(), DashOff.toPx()))
        drawLine(Ink, Offset(x, top), Offset(x, bottom), strokeWidth = SpineWidth.toPx(), pathEffect = if (dashed) dash else null)
        if (cap != SpineCap.NONE) {
            drawSquare(x, middle, CapSize.toPx(), Ink, Ink)
        }
        if (node != null) {
            val y = (CardTop + BandHeight / 2).toPx()
            drawLine(Ink, Offset(x, y), Offset(size.width, y), strokeWidth = SpineWidth.toPx())
            drawSquare(x, y, NodeSize.toPx(), node, Ink)
        }
    }
}

// A square centred on (x, y): an ink outline around a fill.
private fun DrawScope.drawSquare(x: Float, y: Float, side: Float, fill: Color, outline: Color) {
    drawRect(outline, topLeft = Offset(x - side / 2, y - side / 2), size = Size(side, side))
    val inset = Neo.Border.toPx()
    drawRect(fill, topLeft = Offset(x - side / 2 + inset, y - side / 2 + inset), size = Size(side - inset * 2, side - inset * 2))
}

private fun modeIcon(mode: String?): ImageVector? = when (mode) {
    "walk" -> Icons.AutoMirrored.Filled.DirectionsWalk
    "transit" -> Icons.Filled.DirectionsTransit
    "drive" -> Icons.Filled.DirectionsCar
    else -> null
}

/** A travel leg: the dashed stretch of spine, with the minutes (and the mode's icon) on a small tag. */
@Composable
fun TransitRow(label: String, mode: String? = null, cap: SpineCap = SpineCap.NONE) {
    Row(modifier = Modifier.height(IntrinsicSize.Min).heightIn(min = 46.dp)) {
        Spine(dashed = true, cap = cap)
        Row(
            modifier = Modifier
                .align(Alignment.CenterVertically)
                .padding(vertical = 10.dp)
                .neoBlock(Neo.PillShape, if (cap == SpineCap.END) Lime else Card, 0.dp, 0.dp, border = Neo.ThinBorder)
                .padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            modeIcon(mode)?.let { Icon(it, contentDescription = null, tint = Ink, modifier = Modifier.size(15.dp)) }
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = Ink)
        }
    }
}

/** Something the traveller can do to a stop, offered in the stop's menu. */
data class StopAction(val label: String, val testTag: String, val onClick: () -> Unit)

/**
 * One stop: a band in the colour of its main interest carrying the time in mono, then the place, its score as a bold
 * star and its interests as tags. The node on the spine takes the same colour, or turns ink once visited.
 */
@Composable
fun StopRow(stop: TripStop, actions: List<StopAction> = emptyList()) {
    val color = categoryColor(stop.interests.firstOrNull())
    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        Spine(dashed = false, node = if (stop.visited) Ink else color)
        NeoCard(modifier = Modifier.weight(1f).padding(top = CardTop, bottom = 8.dp).testTag(TestTags.TRIP_STOP)) {
            Row(
                modifier = Modifier.fillMaxWidth().height(BandHeight).background(color).padding(start = 12.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${stop.startTime} to ${stop.endTime}",
                    style = MaterialTheme.typography.labelMedium,
                    color = inkOn(color),
                    modifier = Modifier.weight(1f),
                )
                if (actions.isNotEmpty()) {
                    StopMenu(stop.name, actions)
                }
            }
            Box(Modifier.fillMaxWidth().height(Neo.Border).background(Ink))
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stop.name, style = MaterialTheme.typography.titleMedium, color = Ink)
                StopDetails(stop)
            }
        }
    }
}

@Composable
private fun StopMenu(stopName: String, actions: List<StopAction>) {
    var open by remember { mutableStateOf(false) }
    Box {
        NeoIconButton(
            Icons.Filled.MoreVert,
            contentDescription = "Options for $stopName",
            onClick = { open = true },
            size = 32.dp,
            modifier = Modifier.testTag(TestTags.STOP_ACTIONS_BUTTON),
        )
        NeoMenu(expanded = open, onDismissRequest = { open = false }) {
            actions.forEach { action ->
                DropdownMenuItem(
                    text = { Text(action.label, style = MaterialTheme.typography.labelLarge) },
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

// The score with a bold star, the interests in their colours, and whether the stop is locked or visited.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StopDetails(stop: TripStop) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            StarGlyph(filled = true, size = 16.dp)
            Text(scoreText(stop.communityScore), style = MaterialTheme.typography.labelMedium, color = Ink)
        }
        stop.interests.forEach { CategoryTag(it) }
        if (stop.locked) {
            StatusTag("LOCKED IN PLACE", Icons.Filled.Lock, Modifier.testTag(TestTags.STOP_LOCKED))
        }
        if (stop.visited) {
            StatusTag("✓ VISITED", null, Modifier.testTag(TestTags.STOP_VISITED))
        }
    }
}

// An ink tag for the state of a stop.
@Composable
private fun StatusTag(text: String, icon: ImageVector?, modifier: Modifier) {
    Row(
        modifier.background(Ink, Neo.TagShape).padding(horizontal = 7.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        icon?.let { Icon(it, contentDescription = null, tint = Lime, modifier = Modifier.size(12.dp)) }
        Text(text, style = MaterialTheme.typography.labelSmall, color = Card)
    }
}

/** A day with no stops still shows the spine, with the reason beside it. */
@Composable
fun EmptyDayRow(message: String) {
    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        Spine(dashed = true)
        EmptyNote(message, modifier = Modifier.padding(vertical = 10.dp))
    }
}
