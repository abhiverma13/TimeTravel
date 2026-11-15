package com.example.cpen321application.ui.builder

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.theme.Disabled
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Sky

private const val PICKER_MAX_HEIGHT_DP = 420
private const val CHOICE_TILT = 3f

/** Lists the destination's places; tapping one cycles it through must-see, avoid and no preference. */
@Composable
fun PlacePickerDialog(
    picker: PlacePickerState,
    choices: Map<String, PlaceChoice>,
    onToggle: (String) -> Unit,
    onDone: () -> Unit,
) {
    NeoDialog(
        title = "Must-see and avoid",
        onDismissRequest = onDone,
        accent = Sky,
        buttons = { NeoButton("Done", onClick = onDone, compact = true, modifier = Modifier.testTag(TestTags.PLACE_PICKER_DONE)) },
    ) {
        Text("Tap a place once for must-see, twice to avoid it, three times to clear.", style = MaterialTheme.typography.bodySmall, color = InkSoft)
        when {
            picker.loading -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { NeoLoader() }
            picker.error != null -> ErrorNote(picker.error)
            else -> LazyColumn(modifier = Modifier.heightIn(max = PICKER_MAX_HEIGHT_DP.dp)) {
                items(picker.places, key = { it.id }) { place -> PlaceRow(place, choices[place.id] ?: PlaceChoice.NEUTRAL, onToggle) }
            }
        }
    }
}

@Composable
private fun PlaceRow(place: TravelActivity, choice: PlaceChoice, onToggle: (String) -> Unit) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().clickable { onToggle(place.id) }.padding(vertical = 10.dp).testTag(TestTags.PLACE_PICKER_ROW),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(place.name, style = MaterialTheme.typography.titleSmall, color = Ink)
                Text(place.interests.joinToString(" · ") { interestLabel(it) }, style = MaterialTheme.typography.labelSmall, color = InkSoft)
            }
            when (choice) {
                PlaceChoice.MUST_SEE -> Sticker("Must-see", color = Lime, tilt = CHOICE_TILT)
                PlaceChoice.AVOID -> Sticker("Avoid", color = ErrorWash, tilt = -CHOICE_TILT)
                PlaceChoice.NEUTRAL -> Unit
            }
        }
        Box(Modifier.fillMaxWidth().height(Neo.ThinBorder).background(Disabled))
    }
}
