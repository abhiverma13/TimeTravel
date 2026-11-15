package com.example.cpen321application.ui.explore

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Trip
import com.example.cpen321application.data.TripSummary
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoButtonBox
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.tripDatesText
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMM d")

/** Choosing where a place goes: one of the traveller's trips in this city, then one of its days. */
@Composable
fun AddToTripDialog(adding: AddToTripState, onChooseTrip: (TripSummary) -> Unit, onChooseDay: (Int) -> Unit, onDismiss: () -> Unit) {
    NeoDialog(
        title = "Add ${adding.activity.name}",
        onDismissRequest = onDismiss,
        accent = Lime,
        buttons = { NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true) },
    ) {
        val trip = adding.trip
        when {
            adding.loading -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { NeoLoader() }
            trip != null -> DayChoices(trip, onChooseDay)
            adding.trips.isEmpty() -> EmptyNote("You have no trips to this city yet. Plan one first, then add places to it.")
            else -> TripChoices(adding.trips, onChooseTrip)
        }
        if (adding.error != null) {
            ErrorNote(adding.error)
        }
    }
}

@Composable
private fun TripChoices(trips: List<TripSummary>, onChooseTrip: (TripSummary) -> Unit) {
    Text("Which trip?", style = MaterialTheme.typography.titleSmall, color = Ink)
    trips.forEach { trip ->
        NeoButtonBox(
            onClick = { onChooseTrip(trip) },
            color = Card,
            compact = true,
            modifier = Modifier.fillMaxWidth().testTag(TestTags.ADD_TRIP_CHOICE),
        ) {
            Text("${trip.city}, ${tripDatesText(trip)}" + if (trip.groupId != null) " (group trip)" else "", modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun DayChoices(trip: Trip, onChooseDay: (Int) -> Unit) {
    Text(
        "Which day? It goes where it adds the least travel. On a full day, the lowest-ranked unlocked stops make room.",
        style = MaterialTheme.typography.bodyMedium,
        color = Ink,
    )
    trip.days.forEachIndexed { index, day ->
        NeoButtonBox(
            onClick = { onChooseDay(index) },
            color = Card,
            compact = true,
            modifier = Modifier.fillMaxWidth().testTag(TestTags.ADD_DAY_CHOICE),
        ) {
            Text("${LocalDate.parse(day.date).format(DAY_FORMAT)} · ${countText(day.stops.size, "stop")}", modifier = Modifier.weight(1f))
        }
    }
}
