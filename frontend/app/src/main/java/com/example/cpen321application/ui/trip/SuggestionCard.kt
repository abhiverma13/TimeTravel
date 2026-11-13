package com.example.cpen321application.ui.itinerary

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Suggestion
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags

/** A change proposed after a disruption, with the day as it would be; nothing changes until someone accepts it. */
@Composable
fun SuggestionCard(suggestion: Suggestion, onAccept: () -> Unit, onDismiss: () -> Unit) {
    BrandCard(
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).testTag(TestTags.SUGGESTION_CARD),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SectionLabel(if (suggestion.reason == "rain") "Rain on the way" else "Venue closed")
            Text(suggestion.message, style = MaterialTheme.typography.bodyLarge)
            Text(
                "New plan for that day: " + suggestion.proposedStops.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAccept, shape = MaterialTheme.shapes.small, modifier = Modifier.testTag(TestTags.SUGGESTION_ACCEPT_BUTTON)) {
                    Text("Accept")
                }
                TextButton(onClick = onDismiss, modifier = Modifier.testTag(TestTags.SUGGESTION_DISMISS_BUTTON)) { Text("Dismiss") }
            }
        }
    }
}
