package com.example.cpen321application.ui.groups

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.Group
import com.example.cpen321application.data.GroupMember
import com.example.cpen321application.data.JoinRequest
import com.example.cpen321application.data.ROLE_OWNER
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.INTEREST_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.TripCard
import com.example.cpen321application.ui.common.countText

/** Where the group page sends the traveller next. */
data class GroupDetailActions(
    val onBack: () -> Unit,
    val onPlanTrip: (groupId: String, groupName: String) -> Unit,
    val onOpenItinerary: (String) -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupDetailScreen(viewModel: GroupDetailViewModel, actions: GroupDetailActions) {
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { viewModel.load() }
    LaunchedEffect(state.closed) { if (state.closed) actions.onBack() }
    LaunchedEffect(state.message) {
        state.message?.let { message ->
            snackbar.showSnackbar(message)
            viewModel.messageShown()
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.group?.name ?: "Group") },
                navigationIcon = {
                    IconButton(onClick = actions.onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { innerPadding ->
        val modifier = Modifier.fillMaxSize().padding(innerPadding)
        val group = state.group
        when {
            group != null -> GroupContent(group, state, viewModel, actions, modifier)
            state.loading -> Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else -> Column(modifier.padding(20.dp)) {
                Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = viewModel::load) { Text("Try again") }
            }
        }
    }
    GroupConfirmDialog(state.confirming, onConfirm = viewModel::confirm, onDismiss = viewModel::dismissConfirm)
}

@Composable
private fun GroupContent(
    group: Group,
    state: GroupDetailUiState,
    viewModel: GroupDetailViewModel,
    actions: GroupDetailActions,
    modifier: Modifier,
) {
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        InviteCard(group)
        PlanGroupTripCard(onClick = { actions.onPlanTrip(group.id, group.name) })
        if (group.isOwner && state.requests.isNotEmpty()) {
            JoinRequestsCard(state.requests, onAnswer = viewModel::answer)
        }
        if (state.trips.isNotEmpty()) {
            SectionLabel("Group trips")
            state.trips.forEach { trip ->
                TripCard(trip, onClick = { actions.onOpenItinerary(trip.id) }, modifier = Modifier.testTag(TestTags.GROUP_TRIP))
                if (group.isOwner) {
                    OpenToJoinRow(trip.openToJoin, onChange = { open -> viewModel.setOpen(trip, open) })
                }
            }
        }
        MembersCard(group, onRemove = { member -> viewModel.ask(GroupConfirm.Remove(member)) })
        MyPreferencesCard(state, viewModel)
        OutlinedButton(
            onClick = { viewModel.ask(if (group.isOwner) GroupConfirm.Delete else GroupConfirm.Leave) },
            enabled = !state.saving,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.fillMaxWidth().testTag(if (group.isOwner) TestTags.GROUP_DELETE_BUTTON else TestTags.GROUP_LEAVE_BUTTON),
        ) {
            Text(if (group.isOwner) "Delete group" else "Leave group", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun InviteCard(group: Group) {
    val context = LocalContext.current
    BrandCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SectionLabel("Invite code")
            Text(group.inviteCode, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.testTag(TestTags.GROUP_INVITE_CODE))
            Text("Friends join with this code from Groups → Join with a code.", style = MaterialTheme.typography.bodySmall)
            Row {
                TextButton(onClick = { copyInviteCode(context, group) }) { Text("Copy") }
                TextButton(onClick = { shareInviteCode(context, group) }) { Text("Share") }
            }
        }
    }
}

private fun inviteText(group: Group) = "Join my TimeTravel group \"${group.name}\" with the invite code ${group.inviteCode}."

private fun copyInviteCode(context: Context, group: Group) {
    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Invite code", group.inviteCode))
}

private fun shareInviteCode(context: Context, group: Group) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, inviteText(group))
    context.startActivity(Intent.createChooser(send, "Share invite code"))
}

@Composable
private fun PlanGroupTripCard(onClick: () -> Unit) {
    BrandCard(
        onClick = onClick,
        containerColor = MaterialTheme.colorScheme.secondary,
        modifier = Modifier.fillMaxWidth().testTag(TestTags.GROUP_PLAN_TRIP),
    ) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Plan a group trip", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSecondary)
            Text(
                "One plan for everyone: the activities most of you want, nothing anyone vetoed.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSecondary,
            )
        }
        Box(modifier = Modifier.fillMaxWidth().height(5.dp).background(MaterialTheme.colorScheme.secondary))
    }
}

@Composable
private fun MembersCard(group: Group, onRemove: (GroupMember) -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 12.dp, end = 4.dp, bottom = 8.dp)) {
            SectionLabel("Members · ${countText(group.members.size, "traveller")}")
            group.members.forEach { member ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.testTag(TestTags.GROUP_MEMBER)) {
                    Text(
                        text = member.name + if (member.role == ROLE_OWNER) "  ·  Owner" else "",
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f).padding(vertical = 10.dp),
                    )
                    if (group.isOwner && member.role != ROLE_OWNER) {
                        TextButton(onClick = { onRemove(member) }) { Text("Remove") }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MyPreferencesCard(state: GroupDetailUiState, viewModel: GroupDetailViewModel) {
    BrandCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel("Your interests in this group")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                INTEREST_LABELS.forEach { (tag, label) ->
                    FilterChip(selected = tag in state.myInterests, onClick = { viewModel.toggleInterest(tag) }, label = { Text(label) })
                }
            }
            TextButton(onClick = viewModel::saveInterests, enabled = !state.saving, modifier = Modifier.testTag(TestTags.GROUP_SAVE_INTERESTS)) {
                Text("Save interests")
            }
            Text(
                text = if (state.myVetoCount == 0) "You haven't vetoed anything. Veto a stop from any group trip." else "You vetoed ${countText(state.myVetoCount, "place")}.",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (state.myVetoCount > 0) {
                TextButton(onClick = viewModel::clearVetoes, enabled = !state.saving) { Text("Clear vetoes") }
            }
        }
    }
}

@Composable
private fun GroupConfirmDialog(confirming: GroupConfirm?, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    when (confirming) {
        null -> Unit
        GroupConfirm.Leave -> ConfirmDialog(
            "Leave this group?", "You'll lose access to its trips. Rejoin any time with the invite code.", "Leave", onConfirm, onDismiss,
        )
        GroupConfirm.Delete -> ConfirmDialog(
            "Delete this group?", "The group and all its trips are deleted for everyone. This cannot be undone.", "Delete", onConfirm, onDismiss,
        )
        is GroupConfirm.Remove -> ConfirmDialog(
            "Remove ${confirming.member.name}?", "They lose access to the group's trips.", "Remove", onConfirm, onDismiss,
        )
    }
}

// The owner lets travellers nearby find this trip and ask to join the group.
@Composable
private fun OpenToJoinRow(open: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 4.dp)) {
        Text("Open to travellers nearby", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Switch(checked = open, onCheckedChange = onChange, modifier = Modifier.testTag(TestTags.GROUP_OPEN_SWITCH))
    }
}

@Composable
private fun JoinRequestsCard(requests: List<JoinRequest>, onAnswer: (JoinRequest, Boolean) -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.JOIN_REQUESTS)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel("Asking to join")
            requests.forEach { request ->
                Text(request.requester.name, style = MaterialTheme.typography.titleMedium)
                if (request.note.isNotBlank()) {
                    Text("\u201c${request.note}\u201d", style = MaterialTheme.typography.bodyMedium)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onAnswer(request, true) }, shape = MaterialTheme.shapes.small, modifier = Modifier.testTag(TestTags.JOIN_ACCEPT_BUTTON)) {
                        Text("Accept")
                    }
                    TextButton(onClick = { onAnswer(request, false) }) { Text("Decline") }
                }
            }
        }
    }
}
