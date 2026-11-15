package com.example.cpen321application.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Sun

/** The default tilt of a sticker, in degrees. */
const val STICKER_TILT = -3f

private val ChipHeight = 38.dp
private val SegmentHeight = 46.dp
private val CheckSize = 16.dp

/**
 * A toggle chip. Off, it stands up on its shadow in white; on, it is pushed in flat and flooded with [color], with a
 * tick so the state never depends on colour alone.
 */
@Composable
fun NeoChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Lime) {
    val interaction = remember { MutableInteractionSource() }
    val depth = pressDepth(interaction, Neo.SmallShadow, sunk = selected)
    val fill = if (selected) color else Card
    Row(
        modifier = modifier
            .height(ChipHeight)
            .neoBlock(Neo.PillShape, fill, Neo.SmallShadow, depth, border = Neo.ThinBorder)
            .selectable(selected = selected, interactionSource = interaction, indication = null, role = Role.Checkbox, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (selected) {
            Icon(Icons.Filled.Check, contentDescription = null, tint = inkOn(fill), modifier = Modifier.size(CheckSize))
        }
        Text(label, style = MaterialTheme.typography.labelLarge, color = inkOn(fill), maxLines = 1)
    }
}

/** One bordered bar split into choices; the chosen one is filled with [color] and ticked. */
@Composable
fun <T> NeoSegmented(
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    color: Color = Lime,
    tagFor: (T) -> String? = { null },
) {
    Row(
        modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .neoBlock(Neo.ButtonShape, Card, Neo.SmallShadow, Neo.SmallShadow),
    ) {
        options.forEachIndexed { index, (value, label) ->
            if (index > 0) {
                Box(Modifier.width(Neo.Border).fillMaxHeight().background(Ink))
            }
            val on = value == selected
            val tag = tagFor(value)?.let { Modifier.testTag(it) } ?: Modifier
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(SegmentHeight)
                    .background(if (on) color else Card)
                    .selectable(selected = on, role = Role.RadioButton, onClick = { onSelect(value) })
                    .then(tag),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (on) {
                    Icon(Icons.Filled.Check, contentDescription = null, tint = inkOn(color), modifier = Modifier.size(CheckSize))
                }
                Text(label, style = MaterialTheme.typography.labelLarge, color = if (on) inkOn(color) else Ink, maxLines = 1)
            }
        }
    }
}

/** A slightly tilted sticker label, slapped on with a small hard shadow. */
@Composable
fun Sticker(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Sun,
    tilt: Float = STICKER_TILT,
    style: TextStyle = MaterialTheme.typography.labelMedium,
) {
    Box(
        modifier
            .rotate(tilt)
            .neoBlock(Neo.TagShape, color, Neo.TinyShadow, Neo.TinyShadow, border = Neo.ThinBorder)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(text, style = style, color = inkOn(color), maxLines = 1)
    }
}

/** A flat little label in a fill, such as an interest. */
@Composable
fun Tag(text: String, modifier: Modifier = Modifier, color: Color = Card) {
    Box(
        modifier
            .neoBlock(Neo.TagShape, color, 0.dp, 0.dp, border = Neo.ThinBorder)
            .padding(horizontal = 7.dp, vertical = 2.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = inkOn(color), maxLines = 1)
    }
}
