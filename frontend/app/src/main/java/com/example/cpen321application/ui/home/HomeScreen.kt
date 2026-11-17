package com.example.cpen321application.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TripSummary
import com.example.cpen321application.data.UserProfile
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.TripCard
import com.example.cpen321application.ui.common.Wordmark
import com.example.cpen321application.ui.common.tripDatesText
import com.example.cpen321application.ui.groups.ConfirmDialog
import com.example.cpen321application.ui.common.inkOn
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Tangerine

@Composable
fun HomeScreen(
    user: UserProfile,
    recentTrips: List<TripSummary>,
    actions: HomeActions,
    newTripIds: Set<String> = emptySet(),
    deleteError: String? = null,
) {
    var deleting by remember { mutableStateOf<TripSummary?>(null) }
    deleting?.let { trip ->
        ConfirmDialog(
            title = "Delete trip?",
            message = "Delete your ${trip.city} trip (${tripDatesText(trip)})?" +
                if (trip.groupId != null) " It is deleted for everyone in the group." else " This cannot be undone.",
            confirmLabel = "Delete",
            onConfirm = {
                actions.onDeleteTrip(trip.id)
                deleting = null
            },
            onDismiss = { deleting = null },
        )
    }
    Scaffold(topBar = { HomeTopBar() }) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("Hi, ${user.name.substringBefore(' ')}", style = MaterialTheme.typography.displayMedium, color = Ink)
            HomeActionCard(
                title = "Plan a trip",
                subtitle = "Dates, lodging, interests and pace in; a ranked, time-feasible, day-by-day plan out.",
                onClick = actions.onPlanTrip,
                look = ActionLook(Blue, Icons.AutoMirrored.Filled.ArrowForward, Lime),
                modifier = Modifier.testTag(TestTags.HOME_PLAN_TRIP),
            )
            HomeActionCard(
                title = "Groups",
                subtitle = "Plan trips with friends: everyone's interests count, and anyone can veto a stop.",
                onClick = actions.onGroups,
                look = ActionLook(Tangerine, Icons.Filled.Groups, Card),
                modifier = Modifier.testTag(TestTags.HOME_GROUPS),
            )
            if (recentTrips.isNotEmpty()) {
                SectionHeader("Recent trips", Lime, modifier = Modifier.padding(top = 6.dp))
                deleteError?.let { ErrorNote(it) }
                recentTrips.forEach { trip ->
                    TripCard(
                        trip,
                        onClick = { actions.onOpenTrip(trip.id) },
                        modifier = Modifier.testTag(TestTags.RECENT_TRIP),
                        isNew = trip.id in newTripIds,
                        onDelete = if (trip.mine) ({ deleting = trip }) else null,
                    )
                }
            }
        }
    }
}

/** What the home screen can ask the app to do. */
data class HomeActions(
    val onPlanTrip: () -> Unit,
    val onGroups: () -> Unit,
    val onOpenTrip: (String) -> Unit,
    val onDeleteTrip: (String) -> Unit,
)

@Composable
private fun HomeTopBar() {
    Wordmark(
        style = MaterialTheme.typography.headlineSmall,
        modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = 18.dp, top = 18.dp, bottom = 6.dp),
    )
}

/** A home card's fill, and the icon tile in its corner with that tile's fill. */
private class ActionLook(val fill: Color, val icon: ImageVector, val tile: Color)

// A big flat colour block: chunky title, what it does, and an outlined icon tile.
@Composable
private fun HomeActionCard(title: String, subtitle: String, onClick: () -> Unit, look: ActionLook, modifier: Modifier = Modifier) {
    val content = inkOn(look.fill)
    NeoCard(onClick = onClick, color = look.fill, modifier = modifier.fillMaxWidth()) {
        Row(Modifier.padding(20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, style = MaterialTheme.typography.headlineLarge, color = content)
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = content)
            }
            Box(
                Modifier.size(48.dp).neoBlock(Neo.ButtonShape, look.tile, Neo.SmallShadow, Neo.SmallShadow),
                contentAlignment = Alignment.Center,
            ) {
                Icon(look.icon, contentDescription = null, tint = Ink, modifier = Modifier.size(26.dp))
            }
        }
        Spacer(Modifier.height(2.dp))
    }
}
