package com.example.cpen321application.ui.nearby

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.NearbyTrip
import com.example.cpen321application.data.REQUEST_DECLINED
import com.example.cpen321application.data.REQUEST_PENDING
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.tripDatesText
import com.example.cpen321application.ui.map.LOCATION_PERMISSIONS
import com.example.cpen321application.ui.map.hasLocationPermission
import com.example.cpen321application.ui.map.requestCurrentLocation

private const val MAX_NOTE_LENGTH = 200

/** The Nearby tab: group trips near you that are open to new members. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyScreen(viewModel: NearbyViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var permitted by remember { mutableStateOf(hasLocationPermission(context)) }
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        permitted = results.values.any { it }
    }
    val refresh = {
        viewModel.locating()
        requestCurrentLocation(context, viewModel::onPosition)
    }
    LaunchedEffect(permitted) { if (permitted) refresh() else askPermission.launch(LOCATION_PERMISSIONS) }
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            viewModel.messageShown()
        }
    }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Nearby") },
                actions = { if (permitted) IconButton(onClick = refresh) { Icon(Icons.Filled.Refresh, contentDescription = "Refresh") } },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Hint("Group trips within 10 km in the next week whose organizers welcome new people. You only see their plan, never where anyone is or stays.") }
            when {
                !permitted -> item {
                    Column {
                        Hint("Allow location to see trips near you.")
                        TextButton(onClick = { askPermission.launch(LOCATION_PERMISSIONS) }) { Text("Allow") }
                    }
                }
                state.loading -> item { CircularProgressIndicator() }
                state.error != null -> item { Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error) }
                state.trips.isEmpty() -> item { Hint("No open trips near you right now. Check again later.") }
                else -> items(state.trips, key = { it.itineraryId }) { trip -> NearbyTripCard(trip, onAsk = { viewModel.startAsking(trip) }) }
            }
        }
    }
    state.asking?.let { trip -> AskToJoinDialog(trip, state.sending, onSend = viewModel::ask, onDismiss = viewModel::stopAsking) }
}

@Composable
private fun NearbyTripCard(trip: NearbyTrip, onAsk: () -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.NEARBY_TRIP)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(trip.groupName, style = MaterialTheme.typography.titleLarge)
            Text("Organized by ${trip.organizer} · ${countText(trip.memberCount, "member")}", style = MaterialTheme.typography.bodyMedium)
            Text(
                "${trip.city} · ${tripDatesText(trip.startDate, trip.endDate)} · %.1f km away".format(trip.distanceKm),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(trip.stopNames.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            when (trip.myRequest) {
                REQUEST_PENDING -> OutlinedButton(onClick = {}, enabled = false, shape = MaterialTheme.shapes.small) { Text("Request sent") }
                REQUEST_DECLINED -> TextButton(onClick = onAsk) { Text("Not this time. Ask again") }
                else -> Button(onClick = onAsk, shape = MaterialTheme.shapes.small, modifier = Modifier.testTag(TestTags.NEARBY_ASK_BUTTON)) {
                    Text("Ask to join")
                }
            }
        }
    }
}

@Composable
private fun AskToJoinDialog(trip: NearbyTrip, sending: Boolean, onSend: (String) -> Unit, onDismiss: () -> Unit) {
    var note by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ask to join ${trip.groupName}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${trip.organizer} sees your name and this note, and can add you to the group.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= MAX_NOTE_LENGTH) note = it },
                    label = { Text("A note (optional)") },
                    modifier = Modifier.fillMaxWidth().testTag(TestTags.NEARBY_NOTE_FIELD),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSend(note) }, enabled = !sending, modifier = Modifier.testTag(TestTags.NEARBY_SEND_BUTTON)) {
                Text(if (sending) "Sending..." else "Send")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
