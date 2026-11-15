package com.example.cpen321application.ui.groups

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.cpen321application.data.Group
import com.example.cpen321application.data.GroupMember
import com.example.cpen321application.data.JoinRequest
import com.example.cpen321application.data.ROLE_OWNER
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.InterestChips
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoSnackbarHost
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.TripCard
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.neoBlock
import com.example.cpen321application.ui.common.neoSwitchColors
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Disabled
import com.example.cpen321application.ui.theme.ErrorWash
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lilac
import com.example.cpen321application.ui.theme.Lime
import com.example.cpen321application.ui.theme.Mono
import com.example.cpen321application.ui.theme.Pink
import com.example.cpen321application.ui.theme.Sun

private const val CODE_TILT = -3f

/** Where the group page sends the traveller next. */
data class GroupDetailActions(
    val onBack: () -> Unit,
    val onPlanTrip: (groupId: String, groupName: String) -> Unit,
    val onOpenTrip: (String) -> Unit,
)

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
        topBar = { NeoTopBar(title = state.group?.name ?: "Group", onBack = actions.onBack) },
        snackbarHost = { NeoSnackbarHost(snackbar) },
    ) { innerPadding ->
        val modifier = Modifier.fillMaxSize().padding(innerPadding)
        val group = state.group
        when {
            group != null -> GroupContent(group, state, viewModel, actions, modifier)
            state.loading -> Box(modifier, contentAlignment = Alignment.Center) { NeoLoader() }
            else -> Column(modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                ErrorNote(state.error.orEmpty())
                NeoButton("Try again", onClick = viewModel::load, color = Card, compact = true)
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
        modifier = modifier.verticalScroll(rememberScrollState()).padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        InviteCard(group)
        PlanGroupTripCard(onClick = { actions.onPlanTrip(group.id, group.name) })
        if (group.isOwner && state.requests.isNotEmpty()) {
            JoinRequestsCard(state.requests, onAnswer = viewModel::answer)
        }
        if (state.trips.isNotEmpty()) {
            SectionHeader("Group trips", Lilac)
            state.trips.forEach { trip ->
                TripCard(trip, onClick = { actions.onOpenTrip(trip.id) }, modifier = Modifier.testTag(TestTags.GROUP_TRIP))
                if (group.isOwner) {
                    OpenToJoinRow(trip.openToJoin, onChange = { open -> viewModel.setOpen(trip, open) })
                }
            }
        }
        MembersCard(group, onRemove = { member -> viewModel.ask(GroupConfirm.Remove(member)) })
        MyPreferencesCard(state, viewModel)
        NeoButton(
            if (group.isOwner) "Delete group" else "Leave group",
            onClick = { viewModel.ask(if (group.isOwner) GroupConfirm.Delete else GroupConfirm.Leave) },
            enabled = !state.saving,
            color = ErrorWash,
            modifier = Modifier.fillMaxWidth().testTag(if (group.isOwner) TestTags.GROUP_DELETE_BUTTON else TestTags.GROUP_LEAVE_BUTTON),
        )
    }
}

// The invite code, printed big in mono on a yellow card, with ways to pass it on.
@Composable
private fun InviteCard(group: Group) {
    val context = LocalContext.current
    NeoCard(color = Sun, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Sticker("Invite code".uppercase(), color = Ink, tilt = CODE_TILT)
            Text(
                group.inviteCode,
                fontFamily = Mono,
                fontWeight = FontWeight.Bold,
                fontSize = 40.sp,
                letterSpacing = 6.sp,
                color = Ink,
                modifier = Modifier
                    .neoBlock(Neo.ButtonShape, Card, 0.dp, 0.dp)
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .testTag(TestTags.GROUP_INVITE_CODE),
            )
            Text("Friends join with this code from Groups → Join with a code.", style = MaterialTheme.typography.bodySmall, color = Ink)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NeoButton("Copy", onClick = { copyInviteCode(context, group) }, color = Card, compact = true, icon = Icons.Filled.ContentCopy)
                NeoButton("Share", onClick = { shareInviteCode(context, group) }, color = Card, compact = true, icon = Icons.Filled.Share)
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
    NeoCard(onClick = onClick, color = Blue, modifier = Modifier.fillMaxWidth().testTag(TestTags.GROUP_PLAN_TRIP)) {
        Row(Modifier.padding(20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Plan a group trip", style = MaterialTheme.typography.headlineMedium, color = Card)
                Text(
                    "One plan for everyone: the activities most of you want, nothing anyone vetoed.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Card,
                )
            }
            Box(Modifier.size(48.dp).neoBlock(Neo.ButtonShape, Lime, Neo.SmallShadow, Neo.SmallShadow), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Ink)
            }
        }
    }
}

@Composable
private fun MembersCard(group: Group, onRemove: (GroupMember) -> Unit) {
    NeoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel("Members · ${countText(group.members.size, "traveller")}", color = Ink)
            group.members.forEachIndexed { index, member ->
                if (index > 0) {
                    Box(Modifier.fillMaxWidth().height(Neo.ThinBorder).background(Disabled))
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.testTag(TestTags.GROUP_MEMBER),
                ) {
                    SquareAvatar(member.name, size = 38.dp)
                    Text(
                        text = member.name + if (member.role == ROLE_OWNER) "  ·  Owner" else "",
                        style = MaterialTheme.typography.titleSmall,
                        color = Ink,
                        modifier = Modifier.weight(1f),
                    )
                    if (group.isOwner && member.role != ROLE_OWNER) {
                        NeoButton("Remove", onClick = { onRemove(member) }, color = Card, compact = true)
                    }
                }
            }
        }
    }
}

@Composable
private fun MyPreferencesCard(state: GroupDetailUiState, viewModel: GroupDetailViewModel) {
    NeoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionLabel("Your interests in this group", color = Ink)
            InterestChips(state.myInterests, viewModel::toggleInterest)
            NeoButton(
                "Save interests",
                onClick = viewModel::saveInterests,
                enabled = !state.saving,
                color = Lime,
                compact = true,
                modifier = Modifier.testTag(TestTags.GROUP_SAVE_INTERESTS),
            )
            Text(
                text = if (state.myVetoCount == 0) {
                    "You haven't vetoed anything. Veto a stop from any group trip."
                } else {
                    "You vetoed ${countText(state.myVetoCount, "place")}."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = Ink,
            )
            if (state.myVetoCount > 0) {
                NeoButton("Clear vetoes", onClick = viewModel::clearVetoes, enabled = !state.saving, color = Card, compact = true)
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
        Text("Open to travellers nearby", style = MaterialTheme.typography.titleSmall, color = Ink, modifier = Modifier.weight(1f))
        Switch(checked = open, onCheckedChange = onChange, colors = neoSwitchColors(), modifier = Modifier.testTag(TestTags.GROUP_OPEN_SWITCH))
    }
}

@Composable
private fun JoinRequestsCard(requests: List<JoinRequest>, onAnswer: (JoinRequest, Boolean) -> Unit) {
    NeoCard(color = Pink, modifier = Modifier.fillMaxWidth().testTag(TestTags.JOIN_REQUESTS)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel("Asking to join", color = Ink)
            requests.forEach { request ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SquareAvatar(request.requester.name, size = 38.dp)
                    Text(request.requester.name, style = MaterialTheme.typography.titleMedium, color = Ink)
                }
                if (request.note.isNotBlank()) {
                    Text("“${request.note}”", style = MaterialTheme.typography.bodyMedium, color = Ink)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NeoButton(
                        "Accept",
                        onClick = { onAnswer(request, true) },
                        color = Blue,
                        compact = true,
                        modifier = Modifier.testTag(TestTags.JOIN_ACCEPT_BUTTON),
                    )
                    NeoButton("Decline", onClick = { onAnswer(request, false) }, color = Card, compact = true)
                }
            }
        }
    }
}
