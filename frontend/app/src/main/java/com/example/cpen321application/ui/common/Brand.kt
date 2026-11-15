package com.example.cpen321application.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime

/** "TimeTravel", with "Travel" run through a lime highlighter. */
@Composable
fun Wordmark(modifier: Modifier = Modifier, style: TextStyle = MaterialTheme.typography.headlineSmall) {
    Text(
        text = buildAnnotatedString {
            append("Time")
            withStyle(SpanStyle(background = Lime)) { append("Travel") }
        },
        style = style,
        color = Ink,
        modifier = modifier,
    )
}

/** Small mono capitals, for labels above content. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, color: Color = InkSoft) {
    Text(text = text.uppercase(), style = MaterialTheme.typography.labelSmall, color = color, modifier = modifier)
}

/** A list section's heading: a colour block, the label, and a thick rule running to the edge. */
@Composable
fun SectionHeader(text: String, color: Color, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(12.dp).background(color).border(Neo.ThinBorder, Ink))
        SectionLabel(text, color = Ink)
        Box(Modifier.weight(1f).height(Neo.Border).background(Ink))
    }
}
