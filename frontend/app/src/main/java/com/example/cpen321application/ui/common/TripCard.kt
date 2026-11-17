package com.example.cpen321application.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TripSummary
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lilac
import com.example.cpen321application.ui.theme.Lime
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val TRIP_DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d")
private val STUB_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH)
private val StubWidth = 64.dp
private const val GROUP_TILT = 4f

/** "Oct 30 to Oct 31", or one date for a one-day trip. */
fun tripDatesText(trip: TripSummary): String = tripDatesText(trip.startDate, trip.endDate)

/** "Oct 30 to Oct 31" for dates written YYYY-MM-DD, or one date when they are the same. */
fun tripDatesText(startDate: String, endDate: String): String {
    val start = LocalDate.parse(startDate).format(TRIP_DATE_FORMAT)
    val end = LocalDate.parse(endDate).format(TRIP_DATE_FORMAT)
    return if (start == end) start else "$start to $end"
}

/**
 * A saved trip in a list, like a ticket: a stub with the first day's date (lime for a solo trip, lilac for a group's),
 * then the city, dates and number of stops, with a sticker under them on a group trip. With `onDelete`, a delete button at the end.
 */
@Composable
fun TripCard(
    trip: TripSummary,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isNew: Boolean = false,
    onDelete: (() -> Unit)? = null,
) {
    val isGroup = trip.groupId != null
    val start = LocalDate.parse(trip.startDate)
    NeoCard(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Column(
                modifier = Modifier.width(StubWidth).fillMaxHeight().background(if (isGroup) Lilac else Lime).padding(vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(start.format(STUB_MONTH).uppercase(Locale.ENGLISH), style = MaterialTheme.typography.labelMedium, color = Ink)
                Text("${start.dayOfMonth}", style = MaterialTheme.typography.headlineMedium, color = Ink)
            }
            Box(Modifier.width(Neo.Border).fillMaxHeight().background(Ink))
            Column(Modifier.weight(1f).padding(start = 14.dp, end = 12.dp, top = 14.dp, bottom = 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(trip.city, style = MaterialTheme.typography.titleLarge, color = Ink, modifier = Modifier.weight(1f, fill = false))
                    if (isNew) NewDot()
                }
                Text(
                    text = "${tripDatesText(trip)} · ${countText(trip.stopCount, "stop")}",
                    style = MaterialTheme.typography.labelMedium,
                    color = InkSoft,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (isGroup) Sticker("Group trip", color = Lilac, tilt = GROUP_TILT, modifier = Modifier.padding(top = 8.dp))
            }
            if (onDelete != null) {
                Box(Modifier.fillMaxHeight().padding(end = 12.dp), contentAlignment = Alignment.Center) {
                    NeoIconButton(
                        Icons.Outlined.Delete,
                        contentDescription = "Delete trip",
                        onClick = onDelete,
                        size = 36.dp,
                        modifier = Modifier.testTag(TestTags.DELETE_TRIP),
                    )
                }
            }
        }
    }
}
