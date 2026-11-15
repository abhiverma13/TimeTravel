package com.example.cpen321application.ui.groups

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
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.GroupSummary
import com.example.cpen321application.data.ROLE_OWNER
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.NewDot
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.theme.Blue
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Tangerine

@Composable
fun GroupsScreen(
    viewModel: GroupsViewModel,
    onBack: (() -> Unit)?,
    onOpenGroup: (String) -> Unit,
    newGroupIds: Set<String> = emptySet(),
    header: @Composable () -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }
    LaunchedEffect(state.openedGroupId) {
        state.openedGroupId?.let { groupId ->
            viewModel.groupOpened()
            onOpenGroup(groupId)
        }
    }
    Scaffold(
        topBar = { NeoTopBar(title = "Groups", onBack = onBack, accent = if (onBack == null) Tangerine else null) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            header()
            Text(
                "Plan trips together. Everyone's interests and vetoes shape the group's trips.",
                style = MaterialTheme.typography.bodyLarge,
                color = Ink,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                NeoButton(
                    "Create a group",
                    onClick = { viewModel.showDialog(GroupsDialog.CREATE) },
                    color = Blue,
                    modifier = Modifier.weight(1f).testTag(TestTags.GROUPS_CREATE_BUTTON),
                )
                NeoButton(
                    "Join with a code",
                    onClick = { viewModel.showDialog(GroupsDialog.JOIN) },
                    color = Card,
                    modifier = Modifier.weight(1f).testTag(TestTags.GROUPS_JOIN_BUTTON),
                )
            }
            GroupList(state, newGroupIds, onRetry = viewModel::refresh, onOpenGroup = onOpenGroup)
        }
    }
    state.dialog?.let { dialog ->
        GroupTextDialog(
            dialog = dialog,
            working = state.working,
            error = state.dialogError,
            onConfirm = { text -> if (dialog == GroupsDialog.CREATE) viewModel.create(text) else viewModel.join(text) },
            onDismiss = viewModel::dismissDialog,
        )
    }
}

@Composable
private fun GroupList(state: GroupsUiState, newGroupIds: Set<String>, onRetry: () -> Unit, onOpenGroup: (String) -> Unit) {
    when {
        state.loading -> Box(Modifier.fillMaxWidth().padding(top = 16.dp), contentAlignment = Alignment.Center) { NeoLoader() }
        state.error != null -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ErrorNote(state.error)
            NeoButton("Try again", onClick = onRetry, color = Card, compact = true)
        }
        state.groups.isEmpty() -> EmptyNote(
            "You're not in a group yet. Create one, or join a friend's with their invite code.",
            tag = TestTags.GROUPS_EMPTY,
        )
        else -> {
            SectionHeader(countText(state.groups.size, "group"), Tangerine, modifier = Modifier.padding(top = 6.dp))
            state.groups.forEach { group -> GroupCard(group, isNew = group.id in newGroupIds, onClick = { onOpenGroup(group.id) }) }
        }
    }
}

// A group as a card: its monogram block, name and red dot, and who is in it.
@Composable
private fun GroupCard(group: GroupSummary, isNew: Boolean, onClick: () -> Unit) {
    NeoCard(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag(TestTags.GROUP_CARD)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            SquareAvatar(group.name, size = 52.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(group.name, style = MaterialTheme.typography.titleLarge, color = Ink, modifier = Modifier.weight(1f, fill = false))
                    if (isNew) NewDot()
                }
                Text(
                    text = countText(group.memberCount, "member") + if (group.myRole == ROLE_OWNER) " · You own this group" else "",
                    style = MaterialTheme.typography.labelMedium,
                    color = InkSoft,
                )
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Ink)
        }
    }
}
