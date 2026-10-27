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

/** "Oct 30 to Oct 31", or one date for a one-day trip. */
fun tripDatesText(trip: ItinerarySummary): String = tripDatesText(trip.startDate, trip.endDate)

/** "Oct 30 to Oct 31" for dates written YYYY-MM-DD, or one date when they are the same. */
fun tripDatesText(startDate: String, endDate: String): String {
    val start = LocalDate.parse(startDate).format(TRIP_DATE_FORMAT)
    val end = LocalDate.parse(endDate).format(TRIP_DATE_FORMAT)
    return if (start == end) start else "$start to $end"
}

/** A saved trip in a list: city, dates and number of stops, marked when it is a group trip. */
@Composable
fun TripCard(trip: ItinerarySummary, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val dates = tripDatesText(trip)
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
