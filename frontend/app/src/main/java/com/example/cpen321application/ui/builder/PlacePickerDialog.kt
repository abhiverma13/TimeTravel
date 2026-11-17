package com.example.cpen321application.ui.builder

import androidx.compose.foundation.background
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
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoChip
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Disabled
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Sky

private const val PICKER_MAX_HEIGHT_DP = 360

/** Lists the destination's places, with a search box; each place can be marked must-see or avoided. */
@Composable
fun PlacePickerDialog(
    picker: PlacePickerState,
    choices: Map<String, PlaceChoice>,
    onChoose: (String, PlaceChoice) -> Unit,
    onDone: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    NeoDialog(
        title = "Must-see and avoid",
        onDismissRequest = onDone,
        accent = Sky,
        buttons = { NeoButton("Done", onClick = onDone, compact = true, modifier = Modifier.testTag(TestTags.PLACE_PICKER_DONE)) },
    ) {
        TextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search places") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            modifier = Modifier.fillMaxWidth().neoField(),
        )
        when {
            picker.loading -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { NeoLoader() }
            picker.error != null -> ErrorNote(picker.error)
            else -> {
                val places = picker.places.filter { it.name.contains(query.trim(), ignoreCase = true) }
                if (places.isEmpty()) {
                    Text("No places match \"${query.trim()}\".", style = MaterialTheme.typography.bodySmall, color = InkSoft)
                }
                LazyColumn(modifier = Modifier.heightIn(max = PICKER_MAX_HEIGHT_DP.dp)) {
                    items(places, key = { it.id }) { place -> PlaceRow(place, choices[place.id] ?: PlaceChoice.NEUTRAL, onChoose) }
                }
            }
        }
    }
}

// The place's name and interests, then its two choices; tapping the chosen one again clears it.
@Composable
private fun PlaceRow(place: TravelActivity, choice: PlaceChoice, onChoose: (String, PlaceChoice) -> Unit) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp).testTag(TestTags.PLACE_PICKER_ROW),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(place.name, style = MaterialTheme.typography.titleSmall, color = Ink)
                Text(place.interests.joinToString(" · ") { interestLabel(it) }, style = MaterialTheme.typography.labelSmall, color = InkSoft)
            }
            NeoChip("Must-see", selected = choice == PlaceChoice.MUST_SEE, onClick = { onChoose(place.id, PlaceChoice.MUST_SEE) }, color = Lime)
            NeoChip("Avoid", selected = choice == PlaceChoice.AVOID, onClick = { onChoose(place.id, PlaceChoice.AVOID) }, color = ErrorWash)
        }
        Box(Modifier.fillMaxWidth().height(Neo.ThinBorder).background(Disabled))
    }
}
