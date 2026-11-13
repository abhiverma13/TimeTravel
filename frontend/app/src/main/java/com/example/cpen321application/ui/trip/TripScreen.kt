package com.example.cpen321application.ui.trip

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import com.example.cpen321application.data.Trip
import com.example.cpen321application.data.TripDay
import com.example.cpen321application.data.TripStop
import com.example.cpen321application.data.LiveStatus
import com.example.cpen321application.data.Suggestion
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.clockTime
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.feed.SharePostDialog
import com.example.cpen321application.ui.feed.SharePostViewModel
import com.example.cpen321application.ui.builder.BUDGETS
import com.example.cpen321application.ui.builder.PACES
import com.example.cpen321application.ui.builder.TRANSPORT_MODES
import com.example.cpen321application.ui.builder.labelFor
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMMM d")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripScreen(viewModel: TripViewModel, share: SharePostViewModel, onBack: () -> Unit, onOpenMap: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val sharing by share.state.collectAsState()
    val message by viewModel.message.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val live by viewModel.live.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.messageShown()
        }
    }
    LaunchedEffect(sharing.shared) {
        if (sharing.shared) {
            snackbar.showSnackbar("Shared to the feed.")
            share.sharedShown()
        }
    }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { TripTopBar((state as? TripUiState.Loaded)?.trip, onBack, onOpenMap, share::open) },
    ) { innerPadding ->
        val modifier = Modifier.fillMaxSize().padding(innerPadding)
        when (val current = state) {
            TripUiState.Loading -> Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            is TripUiState.Failed -> Column(modifier.padding(20.dp)) {
                Text(current.message, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = viewModel::load) { Text("Try again") }
            }
            is TripUiState.Loaded -> Column(modifier) {
                if (busy) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                Timeline(current.trip, live, suggestions, viewModel)
            }
        }
    }
    if (sharing.open) {
        SharePostDialog(sharing, share)
    }
}

@Composable
private fun Timeline(trip: Trip, live: LiveStatus, suggestions: List<Suggestion>, viewModel: TripViewModel) {
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)) {
        item { LiveBanner(live) }
        items(suggestions, key = { "suggestion-${it.id}" }) { suggestion ->
            SuggestionCard(suggestion, onAccept = { viewModel.acceptSuggestion(suggestion) }, onDismiss = { viewModel.dismissSuggestion(suggestion) })
        }
        item { Summary(trip) }
        trip.days.forEachIndexed { dayIndex, day ->
            dayTimeline(
                day,
                DayHeading(dayIndex + 1, trip.days.size, trip.city),
                trip.transportMode,
                onReplan = { viewModel.replanDay(dayIndex, day.date) },
            ) { stopIndex, stop ->
                stopActions(viewModel, StopPosition(dayIndex, stopIndex, day.stops.size), stop, isGroupTrip = trip.groupId != null)
            }
        }
    }
}

/** Where a stop sits in the trip, for the actions that depend on it. */
private data class StopPosition(val dayIndex: Int, val stopIndex: Int, val stopCount: Int)

private fun stopActions(viewModel: TripViewModel, at: StopPosition, stop: TripStop, isGroupTrip: Boolean): List<StopAction> =
    buildList {
        add(
            if (stop.locked) {
                StopAction("Unlock", TestTags.STOP_ACTION_LOCK) { viewModel.setLocked(at.dayIndex, stop, locked = false) }
            } else {
                StopAction("Lock in place", TestTags.STOP_ACTION_LOCK) { viewModel.setLocked(at.dayIndex, stop, locked = true) }
            },
        )
        if (at.stopIndex > 0) {
            add(StopAction("Move earlier", TestTags.STOP_ACTION_MOVE_EARLIER) { viewModel.move(at.dayIndex, stop, at.stopIndex - 1) })
        }
        if (at.stopIndex < at.stopCount - 1) {
            add(StopAction("Move later", TestTags.STOP_ACTION_MOVE_LATER) { viewModel.move(at.dayIndex, stop, at.stopIndex + 1) })
        }
        add(
            if (stop.visited) {
                StopAction("Not visited yet", TestTags.STOP_ACTION_VISIT) { viewModel.setVisited(at.dayIndex, stop, visited = false) }
            } else {
                StopAction("Mark visited", TestTags.STOP_ACTION_VISIT) { viewModel.setVisited(at.dayIndex, stop, visited = true) }
            },
        )
        add(StopAction("Remove", TestTags.STOP_ACTION_REMOVE) { viewModel.remove(at.dayIndex, stop) })
        if (isGroupTrip) {
            add(StopAction("Veto for this group", TestTags.STOP_ACTION_VETO) { viewModel.veto(stop) })
        }
    }

// The trip's city, back, and once the plan is loaded, its map and sharing it to the feed.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TripTopBar(trip: Trip?, onBack: () -> Unit, onOpenMap: () -> Unit, onShare: () -> Unit) {
    TopAppBar(
        title = { Text(trip?.city?.let { "$it trip" } ?: "Trip") },
        navigationIcon = {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
        },
        actions = {
            if (trip != null) {
                IconButton(onClick = onOpenMap, modifier = Modifier.testTag(TestTags.MAP_BUTTON)) {
                    Icon(Icons.Filled.Place, contentDescription = "Map")
                }
                IconButton(onClick = onShare, modifier = Modifier.testTag(TestTags.SHARE_TRIP_BUTTON)) {
                    Icon(Icons.Filled.Share, contentDescription = "Share to the feed")
                }
            }
        },
    )
}

// Whether everyone's edits are arriving live, or the device is waiting to reconnect.
@Composable
private fun LiveBanner(live: LiveStatus) {
    val (text, color) = when (live) {
        LiveStatus.LIVE -> "Live: everyone in the trip sees changes as they happen" to MaterialTheme.colorScheme.secondary
        LiveStatus.CONNECTING -> "Connecting to live updates..." to MaterialTheme.colorScheme.onSurfaceVariant
        LiveStatus.OFFLINE -> "Offline: live updates will resume when you reconnect" to MaterialTheme.colorScheme.error
    }
    Text(
        text = text.uppercase(Locale.ROOT),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier.padding(bottom = 8.dp).testTag(TestTags.LIVE_STATUS),
    )
}

@Composable
private fun Summary(trip: Trip) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 8.dp)) {
        BrandCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel(if (trip.groupId != null) "Your group's trip" else "Your trip")
                Text("From ${trip.lodging.label}", style = MaterialTheme.typography.titleMedium)
                val pace = PACES.firstOrNull { it.first == trip.pace }?.second ?: trip.pace
                val interests = trip.interests.joinToString(", ") { interestLabel(it) }.ifEmpty { "all interests" }
                Text("$pace pace · $interests", style = MaterialTheme.typography.bodyMedium)
                val travelTimes = if (trip.travelTimeSource == "google-routes") "travel times from Google Maps" else "estimated travel times"
                Text(
                    text = "${labelFor(TRANSPORT_MODES, trip.transportMode)} · budget ${labelFor(BUDGETS, trip.budget)} · $travelTimes",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "Highest-rated first, but only where the clock, the opening hours and the travel time allow it.",
                    style = MaterialTheme.typography.bodySmall,
                    fontStyle = FontStyle.Italic,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Planned in ${trip.generationMs} ms from ${trip.candidateCount} candidate activities.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        trip.warnings.forEach { warning ->
            BrandCard(
                modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_WARNING),
                containerColor = MaterialTheme.colorScheme.errorContainer,
            ) {
                Text(warning, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(14.dp))
            }
        }
    }
}

/** "Day 2 of 3 · Vancouver". */
private data class DayHeading(val dayNumber: Int, val dayCount: Int, val city: String)

private fun LazyListScope.dayTimeline(
    day: TripDay,
    heading: DayHeading,
    transportMode: String,
    onReplan: () -> Unit,
    stopActions: (Int, TripStop) -> List<StopAction>,
) {
    item(key = "day-${day.date}") {
        Column(modifier = Modifier.padding(top = 16.dp, bottom = 4.dp).testTag(TestTags.TRIP_DAY)) {
            SectionLabel("Day ${heading.dayNumber} of ${heading.dayCount} · ${heading.city}")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    LocalDate.parse(day.date).format(DAY_FORMAT.withLocale(Locale.getDefault())),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onReplan, modifier = Modifier.testTag(TestTags.DAY_REPLAN_BUTTON)) { Text("Re-plan") }
            }
        }
    }
    if (day.stops.isEmpty()) {
        item(key = "empty-${day.date}") { EmptyDayRow("Nothing fits this day. Try longer days or other interests.") }
        return
    }
    itemsIndexed(day.stops, key = { _, stop -> "${day.date}-${stop.activityId}" }) { index, stop ->
        TransitRow(transitText(stop.travelMinutes, transportMode, fromLodging = index == 0))
        StopRow(stop, stopActions(index, stop))
    }
    item(key = "return-${day.date}") {
        TransitRow("Back at lodging by ${backAt(day)}  ·  ${day.returnTravelMinutes} min $transportMode")
    }
}

// The mode is walk, transit or drive, so it reads as "14 min walk".
private fun transitText(minutes: Int, transportMode: String, fromLodging: Boolean): String = when {
    minutes == 0 -> "Next door"
    fromLodging -> "$minutes min from lodging"
    else -> "$minutes min $transportMode"
}

private fun backAt(day: TripDay): String {
    val (hours, minutes) = day.stops.last().endTime.split(':').map(String::toInt)
    return clockTime(hours * MINUTES_PER_HOUR + minutes + day.returnTravelMinutes)
}

private const val MINUTES_PER_HOUR = 60
