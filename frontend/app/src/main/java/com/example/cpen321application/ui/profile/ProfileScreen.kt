package com.example.cpen321application.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.FriendLists
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.data.UserProfile
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.friends.FriendAction
import com.example.cpen321application.ui.friends.TravellerRow

/** What the Profile tab can ask the app to do. */
data class ProfileActions(
    val onEditProfile: () -> Unit,
    val onSignOut: () -> Unit,
    val onFindFriends: () -> Unit,
    val onOpenTraveller: (String) -> Unit,
)

/** The Profile tab: the traveller's profile, privacy setting and friends. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(user: UserProfile, viewModel: ProfileViewModel, actions: ProfileActions) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Profile") },
                actions = {
                    TextButton(onClick = actions.onSignOut, modifier = Modifier.testTag(TestTags.SIGN_OUT_BUTTON)) { Text("Sign out") }
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(user.name, style = MaterialTheme.typography.headlineMedium)
            ProfileCard(user, onEdit = actions.onEditProfile)
            state.lists?.let { lists -> PrivacyCard(lists.isPrivate, state.savingPrivacy, viewModel::setPrivate) }
            state.actionError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = actions.onFindFriends,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth().testTag(TestTags.FIND_FRIENDS_BUTTON),
            ) { Text("Find friends") }
            FriendSections(state, onRetry = viewModel::refresh, onOpen = actions.onOpenTraveller, onAction = viewModel::act)
        }
    }
}

@Composable
private fun ProfileCard(user: UserProfile, onEdit: () -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.PROFILE_CARD)) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 4.dp, end = 4.dp, bottom = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionLabel("Your profile", modifier = Modifier.weight(1f))
                TextButton(onClick = onEdit, modifier = Modifier.testTag(TestTags.PROFILE_EDIT_BUTTON)) { Text("Edit") }
            }
            Text(text = "Home city: " + user.homeCity.ifBlank { "not set" }, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = "Interests: " + user.interests.joinToString(" · ") { interestLabel(it) }.ifBlank { "none yet" },
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "Signed in as ${user.email}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun PrivacyCard(isPrivate: Boolean, saving: Boolean, onChange: (Boolean) -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Private account", style = MaterialTheme.typography.titleMedium)
                Text(
                    if (isPrivate) "Only your friends see your home city and posts." else "Anyone on TimeTravel can see your home city and posts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = isPrivate, onCheckedChange = onChange, enabled = !saving, modifier = Modifier.testTag(TestTags.PRIVACY_SWITCH))
        }
    }
}

@Composable
private fun FriendSections(state: ProfileUiState, onRetry: () -> Unit, onOpen: (String) -> Unit, onAction: (Traveller, FriendAction) -> Unit) {
    val lists: FriendLists? = state.lists
    when {
        state.loading -> CircularProgressIndicator()
        lists == null -> Column {
            Text(state.error ?: "Couldn't load your friends.", color = MaterialTheme.colorScheme.error)
            TextButton(onClick = onRetry) { Text("Try again") }
        }
        else -> {
            val rows = TravellerRows(state.busyIds, onOpen, onAction)
            FriendSection("Friend requests", lists.incoming, rows)
            FriendSection("Friends (${lists.friends.size})", lists.friends, rows)
            FriendSection("Requests you sent", lists.outgoing, rows)
            if (lists.friends.isEmpty() && lists.incoming.isEmpty()) {
                Text(
                    "No friends yet. Find friends to share trips with them.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// What every row in the friend sections shares.
private class TravellerRows(val busyIds: Set<String>, val onOpen: (String) -> Unit, val onAction: (Traveller, FriendAction) -> Unit)

@Composable
private fun FriendSection(title: String, travellers: List<Traveller>, rows: TravellerRows) {
    if (travellers.isEmpty()) {
        return
    }
    SectionLabel(title)
    travellers.forEach { traveller ->
        TravellerRow(
            traveller = traveller,
            busy = traveller.id in rows.busyIds,
            onOpen = { rows.onOpen(traveller.id) },
            onAction = { action -> rows.onAction(traveller, action) },
        )
    }
}
