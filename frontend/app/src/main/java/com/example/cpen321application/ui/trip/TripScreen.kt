package com.example.cpen321application.ui.trip

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Trip
import com.example.cpen321application.data.TripDay
import com.example.cpen321application.data.TripStop
import com.example.cpen321application.data.LiveStatus
import com.example.cpen321application.data.Suggestion
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoIconButton
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoSnackbarHost
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.clockTime
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.common.onTheGrid
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.feed.SharePostDialog
import com.example.cpen321application.ui.feed.SharePostViewModel
import com.example.cpen321application.ui.builder.BUDGETS
import com.example.cpen321application.ui.builder.PACES
import com.example.cpen321application.ui.builder.TRANSPORT_MODES
import com.example.cpen321application.ui.builder.labelFor
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Tangerine
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMMM d")
private const val DAY_TILT = -2f
private const val TRIP_TILT = 3f
private const val PULSE_MILLIS = 900
private val LiveDot = 10.dp

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
        snackbarHost = { NeoSnackbarHost(snackbar) },
        topBar = {
            val trip = (state as? TripUiState.Loaded)?.trip
            TripTopBar(trip, onBack, onOpenMap, onShare = { share.open(askLinkBack = trip?.copiedFrom != null && trip.modifiedSinceCopy) })
        },
    ) { innerPadding ->
        val modifier = Modifier.fillMaxSize().padding(innerPadding)
        when (val current = state) {
            TripUiState.Loading -> Box(modifier, contentAlignment = Alignment.Center) { NeoLoader() }
            is TripUiState.Failed -> Column(modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                ErrorNote(current.message)
                NeoButton("Try again", onClick = viewModel::load, color = Card, compact = true)
            }
            is TripUiState.Loaded -> Column(modifier) {
                if (busy) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth().height(4.dp), color = Ink, trackColor = Lime)
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
    LazyColumn(contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp)) {
        item { LiveBanner(live) }
        items(suggestions, key = { "suggestion-${it.id}" }) { suggestion ->
            SuggestionCard(
                suggestion,
                currentDay = trip.days.getOrNull(suggestion.dayIndex),
                onAccept = { viewModel.acceptSuggestion(suggestion) },
                onDecline = { viewModel.declineSuggestion(suggestion) },
            )
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
@Composable
private fun TripTopBar(trip: Trip?, onBack: () -> Unit, onOpenMap: () -> Unit, onShare: () -> Unit) {
    NeoTopBar(title = trip?.city?.let { "$it trip" } ?: "Trip", onBack = onBack) {
        if (trip != null) {
            NeoIconButton(
                Icons.Filled.Map,
                contentDescription = "Map",
                onClick = onOpenMap,
                color = Lime,
                modifier = Modifier.testTag(TestTags.MAP_BUTTON),
            )
            NeoIconButton(
                Icons.Filled.Share,
                contentDescription = "Share to the feed",
                onClick = onShare,
                color = Pink,
                modifier = Modifier.testTag(TestTags.SHARE_TRIP_BUTTON),
            )
        }
    }
}

// A small lime "Live" tag with a beating dot while everyone's edits arrive live, or a strip while the device is offline.
@Composable
private fun LiveBanner(live: LiveStatus) {
    if (live == LiveStatus.CONNECTING) return
    val isLive = live == LiveStatus.LIVE
    Row(
        modifier = Modifier
            .padding(bottom = 16.dp)
            .neoBlock(Neo.ButtonShape, if (isLive) Lime else ErrorWash, Neo.TinyShadow, Neo.TinyShadow, border = Neo.ThinBorder)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BeatingDot(beating = isLive)
        Text(
            text = (if (isLive) "Live" else "Offline: live updates will resume when you reconnect").uppercase(Locale.ROOT),
            style = MaterialTheme.typography.labelSmall,
            color = Ink,
            modifier = Modifier.testTag(TestTags.LIVE_STATUS),
        )
    }
}

// An ink dot with a ring that swells and fades while the trip is live.
@Composable
private fun BeatingDot(beating: Boolean) {
    val transition = rememberInfiniteTransition(label = "live")
    val beat by transition.animateFloat(
        initialValue = 0f,
        targetValue = if (beating) 1f else 0f,
        animationSpec = infiniteRepeatable(tween(durationMillis = PULSE_MILLIS), RepeatMode.Restart),
        label = "beat",
    )
    Box(
        Modifier
            .size(LiveDot)
            .drawBehind { drawCircle(Ink.copy(alpha = 1 - beat), radius = size.minDimension / 2 * (1 + beat)) }
            .background(Ink, Neo.PillShape),
    )
}

// The plan's basis: where it starts from, the pace and interests, how it gets around, and how it was made.
@Composable
private fun Summary(trip: Trip) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(bottom = 8.dp)) {
        NeoCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Sticker(if (trip.groupId != null) "Your group's trip" else "Your trip", color = Lime, tilt = TRIP_TILT)
                Text(
                    "From ${trip.lodging.label}",
                    style = MaterialTheme.typography.headlineSmall,
                    color = Ink,
                    modifier = Modifier.padding(top = 6.dp),
                )
                val pace = PACES.firstOrNull { it.first == trip.pace }?.second ?: trip.pace
                val interests = trip.interests.joinToString(", ") { interestLabel(it) }.ifEmpty { "all interests" }
                Text("$pace pace · $interests", style = MaterialTheme.typography.titleSmall, color = Ink)
                val travelTimes = if (trip.travelTimeSource == "google-routes") "travel times from Google Maps" else "estimated travel times"
                Text(
                    text = "${labelFor(TRANSPORT_MODES, trip.transportMode)} · budget ${labelFor(BUDGETS, trip.budget)} · $travelTimes",
                    style = MaterialTheme.typography.labelMedium,
                    color = Ink,
                )
                Box(Modifier.padding(vertical = 4.dp).fillMaxWidth().height(Neo.ThinBorder).background(Ink))
                Text("How stops are picked", style = MaterialTheme.typography.labelMedium, color = Ink)
                pickingRules(trip).forEach { rule ->
                    Text("• $rule", style = MaterialTheme.typography.bodySmall, color = InkSoft)
                }
            }
        }
        trip.warnings.forEach { warning ->
            NeoCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_WARNING), color = Tangerine, shadow = Neo.SmallShadow) {
                Text(warning, style = MaterialTheme.typography.bodyMedium, color = Ink, modifier = Modifier.padding(14.dp))
            }
        }
    }
}

// What the planner weighs, in the order it applies them, so the plan does not look arbitrary.
private fun pickingRules(trip: Trip): List<String> {
    val isGroup = trip.groupId != null
    val interests = if (isGroup) "the interests most members picked" else "your interests"
    val leftOut = if (isGroup) "avoided, vetoed and over-budget" else "avoided and over-budget"
    return listOf(
        "Community rating, raised for places matching $interests",
        "Must-see places first; $leftOut places left out",
        "Places within 25 km of ${trip.lodging.label}, fitted around opening hours and travel time",
    )
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
        Column(
            modifier = Modifier.padding(top = 26.dp, bottom = 8.dp).testTag(TestTags.TRIP_DAY),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Sticker("Day ${heading.dayNumber} of ${heading.dayCount} · ${heading.city}".uppercase(), color = Ink, tilt = DAY_TILT)
                Spacer(Modifier.weight(1f))
                NeoButton(
                    "Re-plan",
                    onClick = onReplan,
                    color = Card,
                    compact = true,
                    icon = Icons.Filled.Refresh,
                    modifier = Modifier.testTag(TestTags.DAY_REPLAN_BUTTON),
                )
            }
            Text(
                LocalDate.parse(day.date).format(DAY_FORMAT.withLocale(Locale.getDefault())),
                style = MaterialTheme.typography.headlineLarge,
                color = Ink,
            )
        }
    }
    if (day.stops.isEmpty()) {
        item(key = "empty-${day.date}") { EmptyDayRow("Nothing fits this day. Try longer days or other interests.") }
        return
    }
    itemsIndexed(day.stops, key = { _, stop -> "${day.date}-${stop.activityId}" }) { index, stop ->
        val cap = if (index == 0) SpineCap.START else SpineCap.NONE
        TransitRow(transitText(stop.travelMinutes, transportMode, fromLodging = index == 0), mode = transportMode, cap = cap)
        StopRow(stop, stopActions(index, stop))
    }
    item(key = "return-${day.date}") {
        val text = "Back at lodging by ${backAt(day)}  ·  ${day.returnTravelMinutes} min $transportMode"
        TransitRow(text, mode = transportMode, cap = SpineCap.END)
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
    // Rounded up like the plan's own times: "back by 19:00" rather than "by 18:47".
    return clockTime(onTheGrid(hours * MINUTES_PER_HOUR + minutes + day.returnTravelMinutes))
}

private const val MINUTES_PER_HOUR = 60
