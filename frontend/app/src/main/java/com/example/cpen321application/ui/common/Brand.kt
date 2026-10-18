package com.example.cpen321application.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private const val INNER_RING = 0.84f
private const val LONG_ARM = 0.74f
private const val SHORT_ARM = 0.5f
private const val ARM_WIDTH = 0.13f
private const val HUB = 0.05f
private const val RING_STROKE = 0.045f

/** The compass rose from the presentation's title slide, drawn in the theme's greens. */
@Composable
fun CompassMark(modifier: Modifier = Modifier, size: Dp = 72.dp) {
    val dark = MaterialTheme.colorScheme.primary
    val light = MaterialTheme.colorScheme.secondary
    val ring = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier = modifier.size(size)) {
        val radius = this.size.minDimension / 2
        drawCircle(color = dark, radius = radius * (1 - RING_STROKE), style = Stroke(width = radius * RING_STROKE * 2))
        drawCircle(color = ring, radius = radius * INNER_RING, style = Stroke(width = radius * RING_STROKE))
        val directions = listOf(Offset(0f, -1f), Offset(1f, 0f), Offset(0f, 1f), Offset(-1f, 0f))
        directions.forEachIndexed { index, direction ->
            val armLength = radius * if (index % 2 == 0) LONG_ARM else SHORT_ARM
            drawArm(direction, armLength, radius * ARM_WIDTH, dark, light)
        }
        drawCircle(color = dark, radius = radius * HUB)
    }
}

// One arm of the rose: two triangles, dark on one side and light on the other, like the slide.
private fun DrawScope.drawArm(direction: Offset, length: Float, width: Float, dark: Color, light: Color) {
    val tip = center + direction * length
    val side = Offset(-direction.y, direction.x) * width
    drawPath(Path().apply { moveTo(center.x, center.y); lineTo(tip.x, tip.y); lineTo(center.x + side.x, center.y + side.y); close() }, dark)
    drawPath(Path().apply { moveTo(center.x, center.y); lineTo(tip.x, tip.y); lineTo(center.x - side.x, center.y - side.y); close() }, light)
}

/** "TimeTravel" with "Time" in the deep green and "Travel" in the lighter green, as on the title slide. */
@Composable
fun Wordmark(modifier: Modifier = Modifier, style: TextStyle = MaterialTheme.typography.displaySmall) {
    val first = MaterialTheme.colorScheme.primary
    val second = MaterialTheme.colorScheme.secondary
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = first)) { append("Time") }
            withStyle(SpanStyle(color = second)) { append("Travel") }
        },
        style = style,
        modifier = modifier,
    )
}

/** Small capitals heading, like "WHAT THE APP PRODUCES" on the slides. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier,
    )
}

/** A cream card with a thin rule border, the box style used throughout the presentation. */
@Composable
fun BrandCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surfaceContainerLowest,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = CardDefaults.cardColors(containerColor = containerColor)
    val border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    if (onClick == null) {
        Card(modifier = modifier, shape = MaterialTheme.shapes.small, colors = colors, border = border, content = content)
    } else {
        Card(
            onClick = onClick,
            modifier = modifier,
            shape = MaterialTheme.shapes.small,
            colors = colors,
            border = border,
            content = content,
        )
    }
}
