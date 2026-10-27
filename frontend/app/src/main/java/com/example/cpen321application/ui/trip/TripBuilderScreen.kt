package com.example.cpen321application.ui.trip

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.INTEREST_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripBuilderScreen(viewModel: TripBuilderViewModel, onBack: () -> Unit, onItineraryReady: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    var choosingDates by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.generatedItineraryId) {
        val itineraryId = state.generatedItineraryId
        if (itineraryId != null) {
            viewModel.itineraryOpened()
            onItineraryReady(itineraryId)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.group?.let { "Plan for ${it.name}" } ?: "Trip Builder") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            TripDetails(state, viewModel, onChooseDates = { choosingDates = true })
            TripPreferences(state, viewModel)
            if (state.error != null) {
                Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag(TestTags.TRIP_ERROR))
            }
            Button(
                onClick = viewModel::generate,
                enabled = !state.generating,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth().height(52.dp).testTag(TestTags.GENERATE_BUTTON),
            ) {
                if (state.generating) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Generate itinerary")
                }
            }
        }
    }

    if (choosingDates) {
        TripDatesDialog(
            start = state.startDate,
            end = state.endDate,
            onConfirm = { start, end ->
                viewModel.onDatesChange(start, end ?: start)
                choosingDates = false
            },
            onDismiss = { choosingDates = false },
        )
    }
}

@Composable
private fun TripDetails(state: TripBuilderUiState, viewModel: TripBuilderViewModel, onChooseDates: () -> Unit) {
    SectionLabel("Destination")
    OutlinedTextField(
        value = state.city,
        onValueChange = viewModel::onCityChange,
        label = { Text("City") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_CITY_FIELD),
    )
    SectionLabel("Dates")
    OutlinedButton(
        onClick = onChooseDates,
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_DATES_BUTTON),
    ) {
        Text(datesText(state.startDate, state.endDate))
    }
    SectionLabel("Your days")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        TimeDropdown("Start", state.dayStart, { it?.let(viewModel::onDayStartChange) }, Modifier.weight(1f))
        TimeDropdown("End", state.dayEnd, { it?.let(viewModel::onDayEndChange) }, Modifier.weight(1f))
    }
    SectionLabel("Arrival and departure (optional)")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        TimeDropdown("Arrive", state.arrivalTime, viewModel::onArrivalChange, Modifier.weight(1f), notSetLabel = "Not set")
        TimeDropdown("Depart", state.departureTime, viewModel::onDepartureChange, Modifier.weight(1f), notSetLabel = "Not set")
    }
    SectionLabel("Lodging (optional)")
    OutlinedTextField(
        value = state.lodging,
        onValueChange = viewModel::onLodgingChange,
        label = { Text("Hotel name or address") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().testTag(TestTags.TRIP_LODGING_FIELD),
    )
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun TripPreferences(state: TripBuilderUiState, viewModel: TripBuilderViewModel) {
    SectionLabel("Interests")
    val group = state.group
    if (group != null) {
        Text(
            "Everyone's interests and vetoes in ${group.name} shape this plan. Change yours on the group's page.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.testTag(TestTags.TRIP_GROUP_NOTE),
        )
    } else {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            INTEREST_LABELS.forEach { (tag, label) ->
                FilterChip(selected = tag in state.interests, onClick = { viewModel.onInterestToggle(tag) }, label = { Text(label) })
            }
        }
    }
    SectionLabel("Pace")
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        PACES.forEachIndexed { index, (pace, label) ->
            SegmentedButton(
                selected = state.pace == pace,
                onClick = { viewModel.onPaceChange(pace) },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = PACES.size),
                label = { Text(label) },
            )
        }
    }
}
