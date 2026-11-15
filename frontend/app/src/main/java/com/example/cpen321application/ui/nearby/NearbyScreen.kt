package com.example.cpen321application.ui.nearby

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.NearbyTrip
import com.example.cpen321application.data.REQUEST_DECLINED
import com.example.cpen321application.data.REQUEST_PENDING
import com.example.cpen321application.ui.common.CategoryTags
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoDialog
import com.example.cpen321application.ui.common.NeoIconButton
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoSnackbarHost
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.common.tripDatesText
import com.example.cpen321application.ui.map.LOCATION_PERMISSIONS
import com.example.cpen321application.ui.map.hasLocationPermission
import com.example.cpen321application.ui.map.requestCurrentLocation
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Tangerine

private const val MAX_NOTE_LENGTH = 200
private const val DISTANCE_TILT = 4f

/** The Nearby tab: group trips near you that are open to new members. */
@Composable
fun NearbyScreen(viewModel: NearbyViewModel, title: String = "Nearby", header: @Composable () -> Unit = {}) {
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
        snackbarHost = { NeoSnackbarHost(snackbar) },
        topBar = {
            NeoTopBar(title = title, accent = Tangerine) {
                if (permitted) NeoIconButton(Icons.Filled.Refresh, contentDescription = "Refresh", onClick = refresh)
            }
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { header() }
            item {
                Hint(
                    "Group trips within 10 km in the next week whose organizers welcome new people. " +
                        "You only see their plan, never where anyone is or stays.",
                )
            }
            when {
                !permitted -> item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        EmptyNote("Allow location to see trips near you.")
                        NeoButton("Allow", onClick = { askPermission.launch(LOCATION_PERMISSIONS) }, color = Blue, compact = true)
                    }
                }
                state.loading -> item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { NeoLoader() } }
                state.error != null -> item { ErrorNote(state.error.orEmpty()) }
                state.trips.isEmpty() -> item { EmptyNote("No open trips near you right now. Check again later.") }
                else -> items(state.trips, key = { it.tripId }) { trip -> NearbyTripCard(trip, onAsk = { viewModel.startAsking(trip) }) }
            }
        }
    }
    state.asking?.let { trip -> AskToJoinDialog(trip, state.sending, onSend = viewModel::ask, onDismiss = viewModel::stopAsking) }
}

@Composable
private fun NearbyTripCard(trip: NearbyTrip, onAsk: () -> Unit) {
    NeoCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.NEARBY_TRIP)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(trip.groupName, style = MaterialTheme.typography.headlineSmall, color = Ink, modifier = Modifier.weight(1f))
                Sticker("%.1f km".format(trip.distanceKm), color = Sky, tilt = DISTANCE_TILT)
            }
            Text(
                "Organized by ${trip.organizer} · ${countText(trip.memberCount, "member")}",
                style = MaterialTheme.typography.titleSmall,
                color = Ink,
            )
            Text(
                "${trip.city} · ${tripDatesText(trip.startDate, trip.endDate)} · %.1f km away".format(trip.distanceKm),
                style = MaterialTheme.typography.labelMedium,
                color = InkSoft,
            )
            CategoryTags(trip.interests)
            Text(trip.stopNames.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = InkSoft)
            when (trip.myRequest) {
                REQUEST_PENDING -> NeoButton("Request sent", onClick = {}, enabled = false, compact = true)
                REQUEST_DECLINED -> NeoButton("Not this time. Ask again", onClick = onAsk, color = Card, compact = true)
                else -> NeoButton(
                    "Ask to join",
                    onClick = onAsk,
                    color = Blue,
                    compact = true,
                    modifier = Modifier.testTag(TestTags.NEARBY_ASK_BUTTON),
                )
            }
        }
    }
}

@Composable
private fun AskToJoinDialog(trip: NearbyTrip, sending: Boolean, onSend: (String) -> Unit, onDismiss: () -> Unit) {
    var note by rememberSaveable { mutableStateOf("") }
    NeoDialog(
        title = "Ask to join ${trip.groupName}",
        onDismissRequest = onDismiss,
        accent = Tangerine,
        buttons = {
            NeoButton("Cancel", onClick = onDismiss, color = Card, compact = true)
            NeoButton(
                if (sending) "Sending..." else "Send",
                onClick = { onSend(note) },
                enabled = !sending,
                color = Blue,
                compact = true,
                modifier = Modifier.testTag(TestTags.NEARBY_SEND_BUTTON),
            )
        },
    ) {
        Text("${trip.organizer} sees your name and this note, and can add you to the group.", style = MaterialTheme.typography.bodySmall, color = Ink)
        TextField(
            value = note,
            onValueChange = { if (it.length <= MAX_NOTE_LENGTH) note = it },
            label = { Text("A note (optional)") },
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            modifier = Modifier.fillMaxWidth().neoField().testTag(TestTags.NEARBY_NOTE_FIELD),
        )
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = InkSoft)
}
