package com.example.cpen321application.ui.explore

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Itinerary
import com.example.cpen321application.data.ItinerarySummary
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.tripDatesText
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMM d")

/** Choosing where a place goes: one of the traveller's trips in this city, then one of its days. */
@Composable
fun AddToTripDialog(adding: AddToTripState, onChooseTrip: (ItinerarySummary) -> Unit, onChooseDay: (Int) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add ${adding.activity.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val trip = adding.trip
                when {
                    adding.loading -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    trip != null -> DayChoices(trip, onChooseDay)
                    adding.trips.isEmpty() -> Text("You have no trips to this city yet. Plan one first, then add places to it.")
                    else -> TripChoices(adding.trips, onChooseTrip)
                }
                if (adding.error != null) {
                    Text(adding.error, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun TripChoices(trips: List<ItinerarySummary>, onChooseTrip: (ItinerarySummary) -> Unit) {
    Text("Which trip?", style = MaterialTheme.typography.bodyMedium)
    trips.forEach { trip ->
        OutlinedButton(
            onClick = { onChooseTrip(trip) },
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.fillMaxWidth().testTag(TestTags.ADD_TRIP_CHOICE),
        ) {
            Text("${trip.city}, ${tripDatesText(trip)}" + if (trip.groupId != null) " (group trip)" else "")
        }
    }
}

@Composable
private fun DayChoices(trip: Itinerary, onChooseDay: (Int) -> Unit) {
    Text(
        "Which day? It goes where it adds the least travel. On a full day, the lowest-ranked unlocked stops make room.",
        style = MaterialTheme.typography.bodyMedium,
    )
    trip.days.forEachIndexed { index, day ->
        OutlinedButton(
            onClick = { onChooseDay(index) },
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.fillMaxWidth().testTag(TestTags.ADD_DAY_CHOICE),
        ) {
            Text("${LocalDate.parse(day.date).format(DAY_FORMAT)} · ${countText(day.stops.size, "stop")}")
        }
    }
}
