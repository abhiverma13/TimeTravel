package com.example.cpen321application.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.RedDot
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.theme.Alarm
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Grotesk
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Paper

private const val HALO_MILLIS = 1100
private const val HALO_GROWTH = 0.9f
private val DotSize = 12.dp

/** The bottom bar: an outlined slab floating on its shadow, the open tab a block of its own colour. */
@Composable
fun TabBar(tabs: List<Tab>, currentRoute: String?, unread: Map<String, Int>, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper)
            .navigationBarsPadding()
            .padding(start = 12.dp, end = 12.dp + Neo.Shadow, top = 4.dp, bottom = 8.dp + Neo.Shadow)
            .neoBlock(Neo.CardShape, Card, Neo.Shadow, Neo.Shadow)
            .padding(6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        tabs.forEach { tab ->
            val hasNew = (tab.area?.let { unread[it] } ?: 0) > 0
            TabItem(tab, selected = tab.route == currentRoute, hasNew = hasNew, onClick = { onSelect(tab.route) }, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun TabItem(tab: Tab, selected: Boolean, hasNew: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val block = if (selected) {
        Modifier.neoBlock(Neo.ButtonShape, tab.color, Neo.TinyShadow, Neo.TinyShadow, border = Neo.ThinBorder)
    } else {
        Modifier
    }
    Column(
        modifier = modifier
            .padding(end = Neo.TinyShadow, bottom = Neo.TinyShadow)
            .then(block)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .testTag(tab.testTag)
            .padding(vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box {
            Icon(
                tab.icon,
                contentDescription = if (hasNew) "${tab.label}, new activity" else null,
                tint = Ink,
                modifier = Modifier.size(24.dp),
            )
            if (hasNew) {
                PulsingDot(Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-3).dp).testTag(TestTags.TAB_BADGE))
            }
        }
        Text(
            tab.label,
            fontFamily = Grotesk,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            fontSize = 12.sp,
            color = Ink,
            maxLines = 1,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

// A red dot with a red halo that swells and fades, so new activity catches the eye.
@Composable
private fun PulsingDot(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "halo")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMillis = HALO_MILLIS), RepeatMode.Restart),
        label = "pulse",
    )
    RedDot(
        modifier.drawBehind {
            drawCircle(Alarm.copy(alpha = 1 - pulse), radius = size.minDimension / 2 * (1 + pulse * HALO_GROWTH))
        },
        size = DotSize,
    )
}
