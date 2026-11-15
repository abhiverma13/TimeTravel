package com.example.cpen321application.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.FriendLists
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.data.UserProfile
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.common.neoSwitchColors
import com.example.cpen321application.ui.friends.FriendAction
import com.example.cpen321application.ui.friends.TravellerRow
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sky
import com.example.cpen321application.ui.theme.Sun

/** What the Profile tab can ask the app to do. */
data class ProfileActions(
    val onEditProfile: () -> Unit,
    val onSignOut: () -> Unit,
    val onFindFriends: () -> Unit,
    val onOpenTraveller: (String) -> Unit,
)

/** The Profile tab: the traveller's profile, privacy setting and friends. */
@Composable
fun ProfileScreen(user: UserProfile, viewModel: ProfileViewModel, actions: ProfileActions) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }
    Scaffold(
        topBar = {
            NeoTopBar(title = "Profile", accent = Sun) {
                NeoButton(
                    "Sign out",
                    onClick = actions.onSignOut,
                    color = Card,
                    compact = true,
                    modifier = Modifier.testTag(TestTags.SIGN_OUT_BUTTON),
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                SquareAvatar(user.name, size = 68.dp)
                Text(user.name, style = MaterialTheme.typography.headlineLarge, color = Ink)
            }
            ProfileCard(user, onEdit = actions.onEditProfile)
            state.lists?.let { lists -> PrivacyCard(lists.isPrivate, state.savingPrivacy, viewModel::setPrivate) }
            state.actionError?.let { ErrorNote(it) }
            NeoButton(
                "Find friends",
                onClick = actions.onFindFriends,
                color = Blue,
                icon = Icons.Filled.PersonAdd,
                modifier = Modifier.fillMaxWidth().testTag(TestTags.FIND_FRIENDS_BUTTON),
            )
            FriendSections(state, onRetry = viewModel::refresh, onOpen = actions.onOpenTraveller, onAction = viewModel::act)
        }
    }
}

@Composable
private fun ProfileCard(user: UserProfile, onEdit: () -> Unit) {
    NeoCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.PROFILE_CARD)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionLabel("Your profile", color = Ink, modifier = Modifier.weight(1f))
                NeoButton("Edit", onClick = onEdit, color = Sun, compact = true, modifier = Modifier.testTag(TestTags.PROFILE_EDIT_BUTTON))
            }
            Text(text = "Home city: " + user.homeCity.ifBlank { "not set" }, style = MaterialTheme.typography.titleMedium, color = Ink)
            Text(
                text = "Interests: " + user.interests.joinToString(" · ") { interestLabel(it) }.ifBlank { "none yet" },
                style = MaterialTheme.typography.bodyLarge,
                color = Ink,
            )
            Text(
                text = "Signed in as ${user.email}",
                style = MaterialTheme.typography.labelSmall,
                color = InkSoft,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

@Composable
private fun PrivacyCard(isPrivate: Boolean, saving: Boolean, onChange: (Boolean) -> Unit) {
    NeoCard(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Private account", style = MaterialTheme.typography.titleMedium, color = Ink)
                Text(
                    if (isPrivate) "Only your friends see your home city and posts." else "Anyone on TimeTravel can see your home city and posts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
            }
            Switch(
                checked = isPrivate,
                onCheckedChange = onChange,
                enabled = !saving,
                colors = neoSwitchColors(),
                modifier = Modifier.testTag(TestTags.PRIVACY_SWITCH),
            )
        }
    }
}

@Composable
private fun FriendSections(state: ProfileUiState, onRetry: () -> Unit, onOpen: (String) -> Unit, onAction: (Traveller, FriendAction) -> Unit) {
    val lists: FriendLists? = state.lists
    when {
        state.loading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { NeoLoader() }
        lists == null -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ErrorNote(state.error ?: "Couldn't load your friends.")
            NeoButton("Try again", onClick = onRetry, color = Card, compact = true)
        }
        else -> {
            val rows = TravellerRows(state.busyIds, onOpen, onAction)
            FriendSection("Friend requests", Pink, lists.incoming, rows)
            FriendSection("Friends (${lists.friends.size})", Lime, lists.friends, rows)
            FriendSection("Requests you sent", Sky, lists.outgoing, rows)
            if (lists.friends.isEmpty() && lists.incoming.isEmpty()) {
                EmptyNote("No friends yet. Find friends to share trips with them.")
            }
        }
    }
}

// What every row in the friend sections shares.
private class TravellerRows(val busyIds: Set<String>, val onOpen: (String) -> Unit, val onAction: (Traveller, FriendAction) -> Unit)

@Composable
private fun FriendSection(title: String, color: Color, travellers: List<Traveller>, rows: TravellerRows) {
    if (travellers.isEmpty()) {
        return
    }
    SectionHeader(title, color, modifier = Modifier.padding(top = 8.dp))
    travellers.forEach { traveller ->
        TravellerRow(
            traveller = traveller,
            busy = traveller.id in rows.busyIds,
            onOpen = { rows.onOpen(traveller.id) },
            onAction = { action -> rows.onAction(traveller, action) },
        )
    }
}
