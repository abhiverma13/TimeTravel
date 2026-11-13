package com.example.cpen321application.ui.trip

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.interestLabel

private const val PICKER_MAX_HEIGHT_DP = 420

/** Lists the destination's places; tapping one cycles it through must-see, avoid and no preference. */
@Composable
fun PlacePickerDialog(
    picker: PlacePickerState,
    choices: Map<String, PlaceChoice>,
    onToggle: (String) -> Unit,
    onDone: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text("Must-see and avoid") },
        text = {
            Column {
                Text("Tap a place once for must-see, twice to avoid it, three times to clear.", style = MaterialTheme.typography.bodySmall)
                when {
                    picker.loading -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    picker.error != null -> Text(picker.error, color = MaterialTheme.colorScheme.error)
                    else -> LazyColumn(modifier = Modifier.heightIn(max = PICKER_MAX_HEIGHT_DP.dp)) {
                        items(picker.places, key = { it.id }) { place -> PlaceRow(place, choices[place.id] ?: PlaceChoice.NEUTRAL, onToggle) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDone, modifier = Modifier.testTag(TestTags.PLACE_PICKER_DONE)) { Text("Done") } },
    )
}

@Composable
private fun PlaceRow(place: TravelActivity, choice: PlaceChoice, onToggle: (String) -> Unit) {
    val (label, color) = when (choice) {
        PlaceChoice.MUST_SEE -> "Must-see" to MaterialTheme.colorScheme.secondary
        PlaceChoice.AVOID -> "Avoid" to MaterialTheme.colorScheme.error
        PlaceChoice.NEUTRAL -> "" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().clickable { onToggle(place.id) }.padding(vertical = 10.dp).testTag(TestTags.PLACE_PICKER_ROW),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(place.name, style = MaterialTheme.typography.bodyLarge)
            Text(place.interests.joinToString(" · ") { interestLabel(it) }, style = MaterialTheme.typography.bodySmall)
        }
        Text(label, style = MaterialTheme.typography.labelLarge, color = color)
    }
}
