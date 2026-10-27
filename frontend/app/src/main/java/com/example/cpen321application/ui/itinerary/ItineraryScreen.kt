package com.example.cpen321application.ui.itinerary

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Itinerary
import com.example.cpen321application.data.ItineraryDay
import com.example.cpen321application.data.ItineraryStop
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.clockTime
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.trip.PACES
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMMM d")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItineraryScreen(viewModel: ItineraryViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val message by viewModel.message.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.messageShown()
        }
    }
    val title = (state as? ItineraryUiState.Loaded)?.itinerary?.city?.let { "$it itinerary" } ?: "Itinerary"
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { innerPadding ->
        val modifier = Modifier.fillMaxSize().padding(innerPadding)
        when (val current = state) {
            ItineraryUiState.Loading -> Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            is ItineraryUiState.Failed -> Column(modifier.padding(20.dp)) {
                Text(current.message, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = viewModel::load) { Text("Try again") }
            }
            is ItineraryUiState.Loaded -> LazyColumn(
                modifier = modifier,
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            ) {
                item { Summary(current.itinerary) }
                val isGroupTrip = current.itinerary.groupId != null
                current.itinerary.days.forEachIndexed { index, day ->
                    dayTimeline(day, DayHeading(index + 1, current.itinerary.days.size, current.itinerary.city)) { stop ->
                        if (isGroupTrip) listOf(StopAction("Veto for this group", TestTags.STOP_ACTION_VETO) { viewModel.veto(stop) }) else emptyList()
                    }
                }
            }
        }
    }
}

@Composable
private fun Summary(itinerary: Itinerary) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 8.dp)) {
        BrandCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel(if (itinerary.groupId != null) "Your group's trip" else "Your trip")
                Text("From ${itinerary.lodging.label}", style = MaterialTheme.typography.titleMedium)
                val pace = PACES.firstOrNull { it.first == itinerary.pace }?.second ?: itinerary.pace
                val interests = itinerary.interests.joinToString(", ") { interestLabel(it) }.ifEmpty { "all interests" }
                Text("$pace pace · $interests", style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = "Highest-rated first, but only where the clock, the opening hours and the travel time allow it.",
                    style = MaterialTheme.typography.bodySmall,
                    fontStyle = FontStyle.Italic,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Planned in ${itinerary.generationMs} ms from ${itinerary.candidateCount} candidate activities.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        itinerary.warnings.forEach { warning ->
            BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.ITINERARY_WARNING), containerColor = MaterialTheme.colorScheme.errorContainer) {
                Text(warning, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(14.dp))
            }
        }
    }
}

/** "Day 2 of 3 · Vancouver". */
private data class DayHeading(val dayNumber: Int, val dayCount: Int, val city: String)

private fun LazyListScope.dayTimeline(day: ItineraryDay, heading: DayHeading, stopActions: (ItineraryStop) -> List<StopAction>) {
    item(key = "day-${day.date}") {
        Column(modifier = Modifier.padding(top = 16.dp, bottom = 4.dp).testTag(TestTags.ITINERARY_DAY)) {
            SectionLabel("Day ${heading.dayNumber} of ${heading.dayCount} · ${heading.city}")
            Text(LocalDate.parse(day.date).format(DAY_FORMAT.withLocale(Locale.getDefault())), style = MaterialTheme.typography.titleLarge)
        }
    }
    if (day.stops.isEmpty()) {
        item(key = "empty-${day.date}") { EmptyDayRow("Nothing fits this day. Try longer days or other interests.") }
        return
    }
    itemsIndexed(day.stops, key = { _, stop -> "${day.date}-${stop.activityId}" }) { index, stop ->
        TransitRow(transitText(stop.travelMinutes, fromLodging = index == 0))
        StopRow(stop, stopActions(stop))
    }
    item(key = "return-${day.date}") {
        TransitRow("Back at lodging by ${backAt(day)}  ·  ${day.returnTravelMinutes} min transit")
    }
}

private fun transitText(minutes: Int, fromLodging: Boolean): String = when {
    minutes == 0 -> "Next door"
    fromLodging -> "$minutes min from lodging"
    else -> "$minutes min transit"
}

private fun backAt(day: ItineraryDay): String {
    val (hours, minutes) = day.stops.last().endTime.split(':').map(String::toInt)
    return clockTime(hours * MINUTES_PER_HOUR + minutes + day.returnTravelMinutes)
}

private const val MINUTES_PER_HOUR = 60
