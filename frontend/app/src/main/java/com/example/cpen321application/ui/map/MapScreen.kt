package com.example.cpen321application.ui.map

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Itinerary
import com.example.cpen321application.data.ItineraryDay
import com.example.cpen321application.data.MemberLocation
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val CHIP_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d")
private const val BOUNDS_PADDING_PX = 120

/** The trip map: the day's stops and route, where you are, and the members sharing their position. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(viewModel: MapViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var permitted by remember { mutableStateOf(hasLocationPermission(context)) }
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        permitted = results.values.any { it }
    }
    LaunchedEffect(Unit) { if (!permitted) askPermission.launch(LOCATION_PERMISSIONS) }
    LocationUpdates(enabled = permitted, onLocation = viewModel::onLocation)
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
                title = { Text(state.itinerary?.city?.let { "$it map" } ?: "Map") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { innerPadding ->
        val itinerary = state.itinerary
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                itinerary != null -> {
                    DayChips(itinerary, state.dayIndex, viewModel::selectDay)
                    TripMap(itinerary.days[state.dayIndex], itinerary, state.members.values.toList(), permitted, Modifier.weight(1f))
                    MapPanel(state, viewModel, permitted, onAllow = { askPermission.launch(LOCATION_PERMISSIONS) })
                }
                state.error != null -> Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(20.dp))
                else -> CircularProgressIndicator(modifier = Modifier.padding(20.dp))
            }
        }
    }
}

@Composable
private fun DayChips(itinerary: Itinerary, selected: Int, onSelect: (Int) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp),
    ) {
        itinerary.days.forEachIndexed { index, day ->
            FilterChip(selected = index == selected, onClick = { onSelect(index) }, label = { Text(LocalDate.parse(day.date).format(CHIP_FORMAT)) })
        }
    }
}

@Composable
private fun TripMap(day: ItineraryDay, itinerary: Itinerary, members: List<MemberLocation>, showMyLocation: Boolean, modifier: Modifier) {
    val camera = rememberCameraPositionState()
    var loaded by remember { mutableStateOf(false) }
    val lodging = LatLng(itinerary.lodging.lat, itinerary.lodging.lng)
    val stops = day.stops.map { LatLng(it.location.lat, it.location.lng) }
    LaunchedEffect(loaded, day.date) { if (loaded) fitTo(camera, listOf(lodging) + stops) }
    GoogleMap(
        modifier = modifier.fillMaxWidth().testTag(TestTags.MAP_VIEW),
        cameraPositionState = camera,
        properties = MapProperties(isMyLocationEnabled = showMyLocation),
        uiSettings = MapUiSettings(myLocationButtonEnabled = showMyLocation, zoomControlsEnabled = false),
        onMapLoaded = { loaded = true },
    ) {
        Polyline(points = listOf(lodging) + stops + lodging, color = MaterialTheme.colorScheme.secondary, width = 8f)
        Marker(
            state = rememberMarkerState(key = "lodging", position = lodging),
            title = itinerary.lodging.label,
            icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_VIOLET),
        )
        day.stops.forEachIndexed { index, stop ->
            Marker(
                state = rememberMarkerState(key = "${day.date}-${stop.activityId}", position = stops[index]),
                title = "${index + 1}. ${stop.name}",
                snippet = "${stop.startTime} to ${stop.endTime}" + if (stop.visited) " · visited" else "",
                icon = BitmapDescriptorFactory.defaultMarker(if (stop.visited) BitmapDescriptorFactory.HUE_GREEN else BitmapDescriptorFactory.HUE_ORANGE),
            )
        }
        members.forEach { member ->
            Marker(
                state = rememberMarkerState(key = "${member.userId}-${member.lat}-${member.lng}", position = LatLng(member.lat, member.lng)),
                title = member.name,
                snippet = "Sharing their location",
                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE),
            )
        }
    }
}

private suspend fun fitTo(camera: CameraPositionState, points: List<LatLng>) {
    val bounds = LatLngBounds.builder().apply { points.forEach(::include) }.build()
    camera.move(CameraUpdateFactory.newLatLngBounds(bounds, BOUNDS_PADDING_PX))
}

// Below the map: the next stop and how far it is, location permission, and sharing your position with the group.
@Composable
private fun MapPanel(state: MapUiState, viewModel: MapViewModel, permitted: Boolean, onAllow: () -> Unit) {
    Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.MAP_NEXT_STOP)) {
            Column(modifier = Modifier.padding(16.dp)) {
                val next = viewModel.nextStop(state)
                Text(
                    when {
                        next == null -> "Every stop of this day is visited."
                        next.metresAway == null -> "Next: ${next.stop.name} at ${next.stop.startTime}"
                        else -> "Next: ${next.stop.name} · ${distanceText(next.metresAway)} away · ${next.stop.startTime}"
                    },
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    if (viewModel.isToday(state)) "Stops are ticked off as you arrive." else "On the day itself, stops are ticked off as you arrive.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (!permitted) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Allow location to see where you are on the map.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                TextButton(onClick = onAllow) { Text("Allow") }
            }
        } else if (state.itinerary?.groupId != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Share my location with the group", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Switch(checked = state.sharing, onCheckedChange = viewModel::setSharing, modifier = Modifier.testTag(TestTags.MAP_SHARE_SWITCH))
            }
        }
    }
}
