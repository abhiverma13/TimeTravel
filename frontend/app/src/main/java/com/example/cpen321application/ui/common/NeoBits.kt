package com.example.cpen321application.ui.common

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.progressSemantics
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.cpen321application.ui.theme.Alarm
import com.example.cpen321application.ui.theme.Archivo
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.ErrorInk
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lilac
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun
import com.example.cpen321application.ui.theme.Tangerine
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val AVATAR_FILLS = listOf(Lime, Pink, Sun, Sky, Tangerine, Lilac)
private const val INITIALS_SCALE = 0.42f

/** The same colour block for a name every time. */
fun avatarColor(name: String): Color = AVATAR_FILLS[(name.hashCode() and Int.MAX_VALUE) % AVATAR_FILLS.size]

private fun initials(name: String): String =
    name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }

/** A square avatar: initials on a colour block, outlined like everything else. Decorative, so hidden from talkback. */
@Composable
fun SquareAvatar(name: String, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    Box(
        modifier
            .size(size)
            .neoBlock(Neo.TagShape, avatarColor(name), Neo.TinyShadow, Neo.TinyShadow, border = Neo.ThinBorder)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(initials(name), fontFamily = Archivo, fontSize = (size.value * INITIALS_SCALE).sp, color = Ink, maxLines = 1)
    }
}

private const val STAR_POINTS = 5
private const val STAR_INNER = 0.5f
private const val STAR_DROP = 0.09f
private const val STAR_STROKE = 0.11f

private fun starPath(centerX: Float, centerY: Float, outer: Float): Path {
    val path = Path()
    val step = PI / STAR_POINTS
    for (point in 0 until STAR_POINTS * 2) {
        val radius = if (point % 2 == 0) outer else outer * STAR_INNER
        val angle = -PI / 2 + point * step
        val x = centerX + (radius * cos(angle)).toFloat()
        val y = centerY + (radius * sin(angle)).toFloat()
        if (point == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    return path
}

/** One bold star: [fill] (sun yellow) when [filled], white when not, always outlined in ink. */
@Composable
fun StarGlyph(filled: Boolean, modifier: Modifier = Modifier, size: Dp = 18.dp, fill: Color = Sun) {
    Canvas(modifier.size(size)) {
        val stroke = this.size.minDimension * STAR_STROKE
        val outer = this.size.minDimension / 2 - stroke / 2
        val path = starPath(center.x, center.y + outer * STAR_DROP, outer)
        drawPath(path, if (filled) fill else Card)
        drawPath(path, Ink, style = Stroke(width = stroke, join = StrokeJoin.Round))
    }
}

/** A rating out of five as bold outlined stars. */
@Composable
fun NeoStars(rating: Int, modifier: Modifier = Modifier, size: Dp = 18.dp) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (star in 1..STAR_POINTS) {
            StarGlyph(filled = star <= rating, size = size)
        }
    }
}

// The Material heart outline, on its 24-unit grid.
private const val HEART = "M12,21.35l-1.45,-1.32C5.4,15.36 2,12.28 2,8.5 2,5.42 4.42,3 7.5,3c1.74,0 3.41,0.81 4.5,2.09" +
    "C13.09,3.81 14.76,3 16.5,3 19.58,3 22,5.42 22,8.5c0,3.78 -3.4,6.86 -8.55,11.54L12,21.35z"
private const val HEART_GRID = 24f
private val HeartPath: Path by lazy { PathParser().parsePathString(HEART).toPath() }

/** A big outlined heart, filled pink once liked. */
@Composable
fun NeoHeart(filled: Boolean, modifier: Modifier = Modifier, size: Dp = 30.dp) {
    Canvas(modifier.size(size)) {
        val factor = this.size.minDimension / HEART_GRID
        scale(factor, pivot = Offset.Zero) {
            drawPath(HeartPath, if (filled) Pink else Card)
            drawPath(HeartPath, Ink, style = Stroke(width = Neo.Border.toPx() / factor, join = StrokeJoin.Round))
        }
    }
}

private const val HOP_MILLIS = 380
private const val HOP_STAGGER_MILLIS = 120
private val HopHeight = 10.dp
private val BlockSize = 16.dp

/** Loading: three colour blocks hopping on their shadows. */
@Composable
fun NeoLoader(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "loader")
    Row(modifier.progressSemantics().padding(vertical = HopHeight), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(Lime, Pink, Blue).forEachIndexed { index, fill ->
            val hop by transition.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = HOP_MILLIS),
                    repeatMode = RepeatMode.Reverse,
                    initialStartOffset = StartOffset(offsetMillis = index * HOP_STAGGER_MILLIS),
                ),
                label = "hop$index",
            )
            Box(
                Modifier
                    .offset(y = -HopHeight * hop)
                    .size(BlockSize)
                    .neoBlock(Neo.TagShape, fill, Neo.SmallShadow, Neo.SmallShadow * (1 - hop), border = Neo.ThinBorder),
            )
        }
    }
}

private val DASH_ON = 9.dp
private val DASH_OFF = 6.dp

/** An empty state: a dashed outline waiting to be filled, with what to do about it. */
@Composable
fun EmptyNote(text: String, modifier: Modifier = Modifier, tag: String? = null) {
    Box(
        modifier
            .fillMaxWidth()
            .drawBehind {
                val stroke = Neo.ThinBorder.toPx()
                drawRoundRect(
                    color = Ink,
                    topLeft = Offset(stroke / 2, stroke / 2),
                    size = this.size.copy(width = this.size.width - stroke, height = this.size.height - stroke),
                    cornerRadius = CornerRadius(14.dp.toPx()),
                    style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(DASH_ON.toPx(), DASH_OFF.toPx()))),
                )
            }
            .padding(18.dp),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = InkSoft,
            modifier = tag?.let { Modifier.testTag(it) } ?: Modifier,
        )
    }
}

/** An error, in a pink-red block with a bang, saying what went wrong. */
@Composable
fun ErrorNote(text: String, modifier: Modifier = Modifier, tag: String? = null) {
    Row(
        modifier
            .fillMaxWidth()
            .neoBlock(Neo.ButtonShape, ErrorWash, Neo.TinyShadow, Neo.TinyShadow, border = Neo.ThinBorder)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(22.dp).background(ErrorInk, Neo.TagShape), contentAlignment = Alignment.Center) {
            Text("!", fontFamily = Archivo, color = Card, fontSize = 14.sp)
        }
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = ErrorInk,
            modifier = (tag?.let { Modifier.testTag(it) } ?: Modifier).weight(1f),
        )
    }
}

/** Snackbars as ink slips with a lime shadow. */
@Composable
fun NeoSnackbarHost(state: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(state, modifier) { data ->
        Row(
            Modifier
                .padding(horizontal = 18.dp, vertical = 12.dp)
                .fillMaxWidth()
                .neoShadow(Neo.ButtonShape, Neo.Shadow, Lime)
                .background(Ink, Neo.ButtonShape)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(12.dp).background(Lime, Neo.TagShape))
            Text(data.visuals.message, style = MaterialTheme.typography.bodyMedium, color = Card)
        }
    }
}

/** Red notification dot with an ink outline. */
@Composable
fun RedDot(modifier: Modifier = Modifier, size: Dp = 12.dp) {
    Box(
        modifier
            .size(size)
            .background(Ink, Neo.PillShape)
            .padding(Neo.ThinBorder)
            .background(Alarm, Neo.PillShape),
    )
}
