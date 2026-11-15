package com.example.cpen321application.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Disabled
import com.example.cpen321application.ui.theme.DisabledInk
import com.example.cpen321application.ui.theme.ErrorInk
import com.example.cpen321application.ui.theme.Ink

private val RegularHeight = 54.dp
private val CompactHeight = 40.dp
private val IconSize = 20.dp

/** Readable text on a fill: white on the dark fills, ink on the bright ones. */
fun inkOn(fill: Color): Color = if (fill == Blue || fill == Ink || fill == ErrorInk) Card else Ink

/**
 * The chunky button frame: outline, flat fill and a hard shadow that collapses as it is pressed. A disabled button sits
 * pushed in and greyed out.
 */
@Composable
fun NeoButtonBox(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = Blue,
    enabled: Boolean = true,
    compact: Boolean = false,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val rest = if (compact) Neo.SmallShadow else Neo.Shadow
    val depth = pressDepth(interaction, rest, sunk = !enabled)
    CompositionLocalProvider(LocalContentColor provides if (enabled) inkOn(color) else DisabledInk) {
        ProvideTextStyle(MaterialTheme.typography.labelLarge) {
            Row(
                modifier = modifier
                    .defaultMinSize(minHeight = if (compact) CompactHeight else RegularHeight)
                    .neoBlock(Neo.ButtonShape, if (enabled) color else Disabled, rest, depth)
                    .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
                    .padding(horizontal = if (compact) 14.dp else 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
                content = content,
            )
        }
    }
}

/** A labelled Neo button, with an optional icon after the label. */
@Composable
fun NeoButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = Blue,
    enabled: Boolean = true,
    compact: Boolean = false,
    icon: ImageVector? = null,
) {
    NeoButtonBox(onClick = onClick, modifier = modifier, color = color, enabled = enabled, compact = compact) {
        Text(text, maxLines = 1)
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(IconSize))
        }
    }
}

/** A square icon button with its own outline and shadow. */
@Composable
fun NeoIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = Card,
    size: Dp = 44.dp,
) {
    val interaction = remember { MutableInteractionSource() }
    val depth = pressDepth(interaction, Neo.SmallShadow)
    Box(
        modifier = modifier
            .size(size)
            .neoBlock(Neo.ButtonShape, color, Neo.SmallShadow, depth)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = inkOn(color), modifier = Modifier.size(IconSize + 2.dp))
    }
}
