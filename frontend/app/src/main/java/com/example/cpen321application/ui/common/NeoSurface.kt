package com.example.cpen321application.ui.common

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink

/** The Neo-Brutal measures: outline widths, shadow depths and corner shapes. */
object Neo {
    val Border = 2.5.dp
    val ThinBorder = 2.dp
    val Shadow = 5.dp
    val SmallShadow = 3.dp
    val TinyShadow = 2.dp
    val CardShape = RoundedCornerShape(14.dp)
    val ButtonShape = RoundedCornerShape(12.dp)
    val FieldShape = RoundedCornerShape(12.dp)
    val PillShape = RoundedCornerShape(percent = 50)
    val TagShape = RoundedCornerShape(6.dp)
}

private const val PRESS_MILLIS = 90

/** The hard, unblurred shadow: the element's own shape in solid ink, pushed down and right by [offset]. */
fun Modifier.neoShadow(shape: Shape, offset: Dp, color: Color = Ink): Modifier = drawBehind {
    if (offset > 0.dp) {
        val outline = shape.createOutline(size, layoutDirection, this)
        val px = offset.toPx()
        translate(left = px, top = px) { drawOutline(outline, color) }
    }
}

/**
 * Everything a Neo block shares: an ink outline, a flat fill and a shadow of [depth]. While [depth] is below [rest] the
 * block slides toward its shadow, so a press looks like pushing a real button down.
 */
fun Modifier.neoBlock(shape: Shape, fill: Color, rest: Dp, depth: Dp, border: Dp = Neo.Border): Modifier =
    offset {
        val push = (rest - depth).roundToPx()
        IntOffset(push, push)
    }
        .neoShadow(shape, depth)
        .border(border, Ink, shape)
        .background(fill, shape)
        .clip(shape)

/** The shadow's depth right now: [rest], collapsing to nothing while pressed or while [sunk]. */
@Composable
fun pressDepth(interaction: InteractionSource, rest: Dp, sunk: Boolean = false): Dp {
    val pressed by interaction.collectIsPressedAsState()
    val depth by animateDpAsState(if (pressed || sunk) 0.dp else rest, tween(durationMillis = PRESS_MILLIS), label = "press")
    return depth
}

/** A white card with a thick outline and a hard shadow; with [onClick] it presses down into its shadow. */
@Composable
fun NeoCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    color: Color = Card,
    shadow: Dp = Neo.Shadow,
    shape: Shape = Neo.CardShape,
    content: @Composable ColumnScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val depth = pressDepth(interaction, shadow)
    val click = if (onClick == null) {
        Modifier
    } else {
        Modifier.clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
    }
    Column(modifier.neoBlock(shape, color, shadow, depth).then(click), content = content)
}
