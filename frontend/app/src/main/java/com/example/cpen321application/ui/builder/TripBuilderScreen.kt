package com.example.cpen321application.ui.builder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.InterestChips
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButtonBox
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoSegmented
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lilac
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun
import com.example.cpen321application.ui.theme.Tangerine
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE, MMM d")

private fun datesText(start: LocalDate?, end: LocalDate?): String {
    if (start == null || end == null) {
        return "Choose dates"
    }
    val days = ChronoUnit.DAYS.between(start, end) + 1
    val range = if (start == end) start.format(DATE_FORMAT) else "${start.format(DATE_FORMAT)} to ${end.format(DATE_FORMAT)}"
    return "$range  ·  " + if (days == 1L) "1 day" else "$days days"
}

@Composable
fun TripBuilderScreen(viewModel: TripBuilderViewModel, onBack: () -> Unit, onTripReady: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    var choosingDates by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.generatedTripId) {
        val tripId = state.generatedTripId
        if (tripId != null) {
            viewModel.tripOpened()
            onTripReady(tripId)
        }
    }

    Scaffold(
        topBar = { NeoTopBar(title = state.group?.let { "Plan for ${it.name}" } ?: "Trip Builder", onBack = onBack) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            TripDetails(state, viewModel, onChooseDates = { choosingDates = true })
            TripPreferences(state, viewModel)
            TripOptions(state, viewModel)
            if (state.error != null) {
                ErrorNote(state.error.orEmpty(), tag = TestTags.TRIP_ERROR, modifier = Modifier.padding(top = 8.dp))
            }
            NeoButtonBox(
                onClick = viewModel::generate,
                enabled = !state.generating,
                color = Blue,
                modifier = Modifier.padding(top = 14.dp).fillMaxWidth().height(60.dp).testTag(TestTags.GENERATE_BUTTON),
            ) {
                if (state.generating) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 3.dp, color = Ink)
                } else {
                    Text("Generate trip", style = MaterialTheme.typography.headlineSmall)
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
                }
            }
        }
    }

    TripBuilderDialogs(state, viewModel, choosingDates, onDatesClosed = { choosingDates = false })
}

// The date-range picker and the must-see and avoid picker, when open.
@Composable
private fun TripBuilderDialogs(state: TripBuilderUiState, viewModel: TripBuilderViewModel, choosingDates: Boolean, onDatesClosed: () -> Unit) {
    state.placePicker?.let { picker ->
        PlacePickerDialog(picker, state.placeChoices, onToggle = viewModel::cyclePlace, onDone = viewModel::closePlacePicker)
    }
    if (choosingDates) {
        TripDatesDialog(
            start = state.startDate,
            end = state.endDate,
            onConfirm = { start, end ->
                viewModel.onDatesChange(start, end ?: start)
                onDatesClosed()
            },
            onDismiss = onDatesClosed,
        )
    }
}

// The form's four kinds of question each keep one colour on their headings: where, when, what and how.
private val WHERE = Sky
private val WHEN = Sun
private val WHAT = Pink
private val HOW = Tangerine

// A heading in its question's colour with its control under it, spaced off the group above.
@Composable
private fun Field(label: String, color: Color, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeader(label, color)
        content()
    }
}

@Composable
private fun TripDetails(state: TripBuilderUiState, viewModel: TripBuilderViewModel, onChooseDates: () -> Unit) {
    Field("Destination", WHERE) {
        TextField(
            value = state.city,
            onValueChange = viewModel::onCityChange,
            label = { Text("City") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            textStyle = MaterialTheme.typography.titleMedium,
            modifier = Modifier.fillMaxWidth().neoField().testTag(TestTags.TRIP_CITY_FIELD),
        )
    }
    Field("Dates", WHEN) {
        NeoButtonBox(onClick = onChooseDates, color = Card, modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_DATES_BUTTON)) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null)
            Text(datesText(state.startDate, state.endDate), modifier = Modifier.weight(1f))
        }
    }
    Field("Your days", WHEN) {
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            TimeDropdown("Start", state.dayStart, { it?.let(viewModel::onDayStartChange) }, Modifier.weight(1f))
            TimeDropdown("End", state.dayEnd, { it?.let(viewModel::onDayEndChange) }, Modifier.weight(1f))
        }
    }
    Field("Arrival and departure (optional)", WHEN) {
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            TimeDropdown("Arrive", state.arrivalTime, viewModel::onArrivalChange, Modifier.weight(1f), notSetLabel = "Not set")
            TimeDropdown("Depart", state.departureTime, viewModel::onDepartureChange, Modifier.weight(1f), notSetLabel = "Not set")
        }
    }
    Field("Lodging (optional)", WHERE) {
        TextField(
            value = state.lodging,
            onValueChange = viewModel::onLodgingChange,
            label = { Text("Hotel name or address") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            modifier = Modifier.fillMaxWidth().neoField().testTag(TestTags.TRIP_LODGING_FIELD),
        )
    }
}

@Composable
private fun TripPreferences(state: TripBuilderUiState, viewModel: TripBuilderViewModel) {
    Field("Interests", WHAT) {
        val group = state.group
        if (group != null) {
            NeoCard(color = Lilac, shadow = Neo.SmallShadow, modifier = Modifier.fillMaxWidth()) {
                Text(
                    "Everyone's interests and vetoes in ${group.name} shape this plan. Change yours on the group's page.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink,
                    modifier = Modifier.padding(14.dp).testTag(TestTags.TRIP_GROUP_NOTE),
                )
            }
        } else {
            InterestChips(state.interests, viewModel::onInterestToggle)
        }
    }
    Field("Pace", WHAT) {
        NeoSegmented(PACES, state.pace, viewModel::onPaceChange)
    }
}

// Transport mode, budget, and the places to include or leave out.
@Composable
private fun TripOptions(state: TripBuilderUiState, viewModel: TripBuilderViewModel) {
    Field("Getting around", HOW) {
        NeoSegmented(TRANSPORT_MODES, state.transportMode, viewModel::onTransportModeChange, tagFor = { "${TestTags.TRIP_MODE}-$it" })
    }
    Field("Budget per activity", HOW) {
        NeoSegmented(BUDGETS, state.budget, viewModel::onBudgetChange, tagFor = { "${TestTags.TRIP_BUDGET}-$it" })
    }
    Field("Must-see and avoid (optional)", HOW) {
        val mustSee = state.placeChoices.values.count { it == PlaceChoice.MUST_SEE }
        val avoid = state.placeChoices.values.count { it == PlaceChoice.AVOID }
        NeoButtonBox(onClick = viewModel::openPlacePicker, color = Card, modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_PLACES_BUTTON)) {
            Icon(Icons.Filled.Tune, contentDescription = null)
            Text(if (mustSee + avoid == 0) "Choose places" else "$mustSee must-see · $avoid avoided", modifier = Modifier.weight(1f))
        }
    }
}
