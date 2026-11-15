package com.example.cpen321application.ui.map

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import com.example.cpen321application.data.MemberLocation
import com.example.cpen321application.data.Trip
import com.example.cpen321application.data.TripDay
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoChip
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoSnackbarHost
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.common.neoSwitchColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.PaperDeep
import com.example.cpen321application.ui.theme.Sun
import com.example.cpen321application.ui.theme.Tangerine
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
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

// Close enough to see the city around the lodging until the day's stops are fitted.
private const val CITY_ZOOM = 12f
private const val ROUTE_WIDTH_PX = 10f

/** The trip map: the day's stops and route, where you are, and the members sharing their position. */
@Composable
fun MapScreen(viewModel: MapViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var permitted by remember { mutableStateOf(hasLocationPermission(context)) }
    var precise by remember { mutableStateOf(hasPreciseLocation(context)) }
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        permitted = results.values.any { it }
        precise = results[Manifest.permission.ACCESS_FINE_LOCATION] == true
    }
    LaunchedEffect(Unit) { if (!permitted) askPermission.launch(LOCATION_PERMISSIONS) }
    LocationUpdates(enabled = permitted, onLocation = { viewModel.onLocation(it, precise) })
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            viewModel.messageShown()
        }
    }
    Scaffold(
        snackbarHost = { NeoSnackbarHost(snackbar) },
        topBar = { NeoTopBar(title = state.trip?.city?.let { "$it map" } ?: "Map", onBack = onBack) },
    ) { innerPadding ->
        val trip = state.trip
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                trip != null -> {
                    DayChips(trip, state.dayIndex, viewModel::selectDay)
                    TripMap(trip.days[state.dayIndex], trip, state.members.values.toList(), permitted, Modifier.weight(1f))
                    MapPanel(state, viewModel, LocationAccess(permitted, precise), onAllow = { askPermission.launch(LOCATION_PERMISSIONS) })
                }
                state.error != null -> ErrorNote(state.error.orEmpty(), modifier = Modifier.padding(18.dp))
                else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { NeoLoader() }
            }
        }
    }
}

@Composable
private fun DayChips(trip: Trip, selected: Int, onSelect: (Int) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(start = 18.dp, end = 18.dp, top = 2.dp, bottom = 14.dp),
    ) {
        trip.days.forEachIndexed { index, day ->
            NeoChip(
                label = LocalDate.parse(day.date).format(CHIP_FORMAT),
                selected = index == selected,
                onClick = { onSelect(index) },
                color = Sun,
            )
        }
    }
}

// The map sits in a thick-outlined frame on its own hard shadow.
@Composable
private fun TripMap(day: TripDay, trip: Trip, members: List<MemberLocation>, showMyLocation: Boolean, modifier: Modifier) {
    var loaded by remember { mutableStateOf(false) }
    val lodging = LatLng(trip.lodging.lat, trip.lodging.lng)
    val camera = rememberCameraPositionState(key = trip.id) {
        position = CameraPosition.fromLatLngZoom(lodging, CITY_ZOOM)
    }
    val stops = day.stops.map { LatLng(it.location.lat, it.location.lng) }
    LaunchedEffect(loaded, day.date) { if (loaded) fitTo(camera, listOf(lodging) + stops) }
    Box(modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp + Neo.Shadow, bottom = Neo.Shadow)) {
        GoogleMap(
            modifier = Modifier.fillMaxSize().neoBlock(Neo.CardShape, PaperDeep, Neo.Shadow, Neo.Shadow).testTag(TestTags.MAP_VIEW),
            cameraPositionState = camera,
            properties = MapProperties(isMyLocationEnabled = showMyLocation),
            uiSettings = MapUiSettings(myLocationButtonEnabled = showMyLocation, zoomControlsEnabled = false),
            onMapLoaded = { loaded = true },
        ) {
            Polyline(points = listOf(lodging) + stops + lodging, color = Blue, width = ROUTE_WIDTH_PX)
            Marker(
                state = rememberMarkerState(key = "lodging", position = lodging),
                title = trip.lodging.label,
                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_VIOLET),
            )
            day.stops.forEachIndexed { index, stop ->
                Marker(
                    state = rememberMarkerState(key = "${day.date}-${stop.activityId}", position = stops[index]),
                    title = "${index + 1}. ${stop.name}",
                    snippet = "${stop.startTime} to ${stop.endTime}" + if (stop.visited) " · visited" else "",
                    icon = BitmapDescriptorFactory.defaultMarker(
                        if (stop.visited) BitmapDescriptorFactory.HUE_GREEN else BitmapDescriptorFactory.HUE_ORANGE,
                    ),
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
}

private suspend fun fitTo(camera: CameraPositionState, points: List<LatLng>) {
    val bounds = LatLngBounds.builder().apply { points.forEach(::include) }.build()
    camera.move(CameraUpdateFactory.newLatLngBounds(bounds, BOUNDS_PADDING_PX))
}

// Below the map: the next stop and how far it is, location permission, and sharing your position with the group.
/** What the app may know of the traveller's position. */
private class LocationAccess(val permitted: Boolean, val precise: Boolean)

@Composable
private fun MapPanel(state: MapUiState, viewModel: MapViewModel, access: LocationAccess, onAllow: () -> Unit) {
    Column(modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        NextStopCard(state, viewModel)
        if (!access.permitted) {
            AllowRow("Allow location to see where you are on the map.", onAllow)
        } else if (!access.precise && viewModel.isToday(state)) {
            AllowRow(
                "Ticking stops off as you arrive needs precise location; approximate location can be a kilometre out.",
                onAllow,
                Modifier.testTag(TestTags.MAP_PRECISE_HINT),
            )
        }
        if (access.permitted && state.trip?.groupId != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Share my location with the group", style = MaterialTheme.typography.titleSmall, color = Ink, modifier = Modifier.weight(1f))
                Switch(
                    checked = state.sharing,
                    onCheckedChange = viewModel::setSharing,
                    colors = neoSwitchColors(),
                    modifier = Modifier.testTag(TestTags.MAP_SHARE_SWITCH),
                )
            }
        }
    }
}

// The next stop on a white card with a tangerine flag tile.
@Composable
private fun NextStopCard(state: MapUiState, viewModel: MapViewModel) {
    NeoCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.MAP_NEXT_STOP)) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(42.dp).neoBlock(Neo.ButtonShape, Tangerine, 0.dp, 0.dp, border = Neo.ThinBorder),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Flag, contentDescription = null, tint = Ink)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                val next = viewModel.nextStop(state)
                Text(
                    when {
                        next == null -> "Every stop of this day is visited."
                        next.metresAway == null -> "Next: ${next.stop.name} at ${next.stop.startTime}"
                        else -> "Next: ${next.stop.name} · ${distanceText(next.metresAway)} away · ${next.stop.startTime}"
                    },
                    style = MaterialTheme.typography.titleSmall,
                    color = Ink,
                )
                Text(
                    if (viewModel.isToday(state)) "Stops are ticked off as you arrive." else "On the day itself, stops are ticked off as you arrive.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
            }
        }
    }
}

@Composable
private fun AllowRow(text: String, onAllow: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(text, style = MaterialTheme.typography.bodySmall, color = Ink, modifier = Modifier.weight(1f))
        NeoButton("Allow", onClick = onAllow, color = Card, compact = true)
    }
}
