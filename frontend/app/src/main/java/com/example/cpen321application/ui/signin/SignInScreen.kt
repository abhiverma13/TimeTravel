package com.example.cpen321application.ui.signin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.cpen321application.ui.common.BigSticker
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButtonBox
import com.example.cpen321application.ui.common.NeoHeart
import com.example.cpen321application.ui.common.RatingSticker
import com.example.cpen321application.ui.common.SlapIn
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.theme.Archivo
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Grotesk
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Paper
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sky

private const val TIME_TILT = -6f
private const val TRAVEL_TILT = 3f
private const val RATING_TILT = 12f
private const val CLOCK_TILT = -8f
private const val DAY_TILT = 7f
private const val GRID_ALPHA = 0.16f
private val GridStep = 22.dp
private const val HEART_TILT = -14f
private const val ROUTE_START_X = 0.36f
private const val C1_X = 1.05f
private const val C1_Y = 0.78f
private const val C2_X = -0.1f
private const val C2_Y = 0.32f
private val CollageHeight = 430.dp
private val WordSize = 78.sp
private val DashOn = 12.dp
private val DashOff = 9.dp

/** Sign-in: the wordmark as a sticker collage on a design-canvas dot grid, then one chunky button. */
@Composable
fun SignInScreen(
    signingIn: Boolean,
    message: String?,
    signInConfigured: Boolean,
    onSignIn: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
            .dotGrid()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 24.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Collage() }
        Text(
            text = "Crowd-rated activities, scheduled into a trip that actually fits your days.",
            fontFamily = Grotesk,
            fontWeight = FontWeight.Medium,
            fontSize = 19.sp,
            lineHeight = 25.sp,
            color = Ink,
        )
        NeoButtonBox(
            onClick = onSignIn,
            enabled = signInConfigured && !signingIn,
            color = Blue,
            modifier = Modifier.fillMaxWidth().height(60.dp).testTag(TestTags.SIGN_IN_BUTTON),
        ) {
            if (signingIn) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 3.dp, color = Card)
            } else {
                GoogleMark()
                Text("Sign in with Google", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
            }
        }
        if (!signInConfigured) {
            ErrorNote("GOOGLE_CLIENT_ID is missing from frontend/local.properties.")
        }
        if (message != null) {
            ErrorNote(message)
        }
    }
}

// The wordmark, read as one word by talkback; the small stickers and the dashed route are decoration.
@Composable
private fun Collage() {
    val words = MaterialTheme.typography.displayLarge.copy(fontSize = WordSize, lineHeight = WordSize)
    Box(
        Modifier
            .fillMaxWidth()
            .height(CollageHeight)
            .route()
            .clearAndSetSemantics { text = AnnotatedString("TimeTravel") },
    ) {
        SlapIn(0, Modifier.align(Alignment.TopStart).offset(x = 2.dp, y = 74.dp)) { BigSticker("Time", Pink, TIME_TILT, style = words) }
        SlapIn(1, Modifier.align(Alignment.TopEnd).offset(x = (-4).dp, y = 196.dp)) { BigSticker("Travel", Lime, TRAVEL_TILT, style = words) }
        SlapIn(2, Modifier.align(Alignment.TopEnd).offset(x = (-20).dp, y = 52.dp)) { RatingSticker("4.7", tilt = RATING_TILT) }
        SlapIn(3, Modifier.align(Alignment.TopStart).offset(x = 22.dp, y = 6.dp)) {
            NeoHeart(filled = true, size = 46.dp, modifier = Modifier.rotate(HEART_TILT))
        }
        SlapIn(4, Modifier.align(Alignment.BottomStart).offset(x = 4.dp, y = (-58).dp)) {
            Sticker("09:15 to 10:15", color = Sky, tilt = CLOCK_TILT)
        }
        SlapIn(5, Modifier.align(Alignment.BottomEnd).offset(x = (-26).dp, y = (-10).dp)) {
            Sticker("Day 1 of 3", color = Blue, tilt = DAY_TILT)
        }
    }
}

// A bold dashed route, like a travel leg on the timeline, sweeping from an ink square at the bottom to one at the top.
private fun Modifier.route(): Modifier = drawBehind {
    val stroke = 4.dp.toPx()
    val cap = 14.dp.toPx()
    val start = Offset(size.width * ROUTE_START_X, size.height - cap)
    val end = Offset(size.width - cap * 2, cap * 2)
    val path = Path().apply {
        moveTo(start.x, start.y)
        cubicTo(size.width * C1_X, size.height * C1_Y, size.width * C2_X, size.height * C2_Y, end.x, end.y)
    }
    val dash = PathEffect.dashPathEffect(floatArrayOf(DashOn.toPx(), DashOff.toPx()))
    drawPath(path, Ink, style = Stroke(width = stroke, pathEffect = dash))
    listOf(start, end).forEach { point ->
        drawRect(Ink, topLeft = Offset(point.x - cap / 2, point.y - cap / 2), size = Size(cap, cap))
    }
}

// A plain lettered tile standing in for the provider's mark.
@Composable
private fun GoogleMark() {
    Box(
        Modifier.size(30.dp).background(Card, Neo.TagShape).border(Neo.ThinBorder, Ink, Neo.TagShape),
        contentAlignment = Alignment.Center,
    ) {
        Text("G", fontFamily = Archivo, fontSize = 16.sp, color = Ink)
    }
}

// The faint dot grid of a design canvas.
private fun Modifier.dotGrid(): Modifier = drawBehind {
    val step = GridStep.toPx()
    val radius = 1.2.dp.toPx()
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) {
            drawCircle(Ink.copy(alpha = GRID_ALPHA), radius = radius, center = Offset(x, y))
            x += step
        }
        y += step
    }
}
