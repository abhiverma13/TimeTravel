package com.example.cpen321application.ui.common

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.ItinerarySummary
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val TRIP_DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d")

/** A saved trip in a list: city, dates and number of stops, marked when it is a group trip. */
@Composable
fun TripCard(trip: ItinerarySummary, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val start = LocalDate.parse(trip.startDate).format(TRIP_DATE_FORMAT)
    val end = LocalDate.parse(trip.endDate).format(TRIP_DATE_FORMAT)
    val dates = if (start == end) start else "$start to $end"
    val group = if (trip.groupId != null) " · Group trip" else ""
    BrandCard(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(trip.city, style = MaterialTheme.typography.titleMedium)
            Text(
                text = "$dates · ${countText(trip.stopCount, "stop")}$group",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
