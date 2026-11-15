package com.example.cpen321application.ui.common

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Sun
import kotlinx.coroutines.delay

private const val RATING_TILT = 4f
private const val SLAP_STAGGER_MILLIS = 140L
private const val SLAP_OVERSIZE = 0.7f
private val BigStickerShape = RoundedCornerShape(16.dp)
private val BigShadow = 6.dp
private val BigBorder = 3.dp

/** A score on a tilted yellow sticker with a bold outlined star. */
@Composable
fun RatingSticker(score: String, modifier: Modifier = Modifier, tilt: Float = RATING_TILT) {
    Row(
        modifier
            .rotate(tilt)
            .neoBlock(Neo.TagShape, Sun, Neo.TinyShadow, Neo.TinyShadow, border = Neo.ThinBorder)
            .padding(horizontal = 7.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        StarGlyph(filled = true, size = 14.dp, fill = Ink)
        Text(score, style = MaterialTheme.typography.labelMedium)
    }
}

/** A giant sticker for a headline word. */
@Composable
fun BigSticker(text: String, color: Color, tilt: Float, modifier: Modifier = Modifier, style: TextStyle = MaterialTheme.typography.displayLarge) {
    Box(
        modifier
            .rotate(tilt)
            .neoBlock(BigStickerShape, color, BigShadow, BigShadow, border = BigBorder)
            .padding(horizontal = 18.dp, vertical = 6.dp),
    ) {
        Text(text, style = style, color = inkOn(color), maxLines = 1)
    }
}

/** Slaps its content down, one after another by [order]: it lands oversized and settles with a bounce. */
@Composable
fun SlapIn(order: Int, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val landing = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(order * SLAP_STAGGER_MILLIS)
        landing.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 320f))
    }
    Box(
        modifier.graphicsLayer {
            val settle = landing.value
            val scale = 1 + (1 - settle) * SLAP_OVERSIZE
            scaleX = scale
            scaleY = scale
            alpha = settle.coerceIn(0f, 1f)
        },
    ) { content() }
}
