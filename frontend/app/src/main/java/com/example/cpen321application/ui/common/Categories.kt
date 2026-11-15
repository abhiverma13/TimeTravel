package com.example.cpen321application.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Lilac
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.PaperDeep
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun
import com.example.cpen321application.ui.theme.Tangerine

/** Each interest has one colour everywhere: its chips, its tags and the time blocks of its stops. */
fun categoryColor(tag: String?): Color = when (tag) {
    "museums" -> Blue
    "outdoors" -> Lime
    "food" -> Tangerine
    "shopping" -> Pink
    "landmarks" -> Sun
    "nightlife" -> Lilac
    "family" -> Sky
    else -> PaperDeep
}

/** An interest as a little tag in its colour. */
@Composable
fun CategoryTag(tag: String, modifier: Modifier = Modifier) {
    Tag(interestLabel(tag), modifier, categoryColor(tag))
}

/** A row of interest tags that wraps. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CategoryTags(tags: List<String>, modifier: Modifier = Modifier) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        tags.forEach { CategoryTag(it) }
    }
}

/** Toggle chips for every interest, each flooding with its own colour when chosen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InterestChips(selected: Collection<String>, onToggle: (String) -> Unit, modifier: Modifier = Modifier) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        INTEREST_LABELS.forEach { (tag, label) ->
            NeoChip(label = label, selected = tag in selected, onClick = { onToggle(tag) }, color = categoryColor(tag))
        }
    }
}
