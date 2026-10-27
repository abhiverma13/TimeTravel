package com.example.cpen321application.ui.groups

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.GroupSummary
import com.example.cpen321application.data.ROLE_OWNER
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupsScreen(viewModel: GroupsViewModel, onBack: () -> Unit, onOpenGroup: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }
    LaunchedEffect(state.openedGroupId) {
        state.openedGroupId?.let { groupId ->
            viewModel.groupOpened()
            onOpenGroup(groupId)
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Groups") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Plan trips together. Everyone's interests and vetoes shape the group's itineraries.", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = { viewModel.showDialog(GroupsDialog.CREATE) },
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(1f).testTag(TestTags.GROUPS_CREATE_BUTTON),
                ) { Text("Create a group") }
                OutlinedButton(
                    onClick = { viewModel.showDialog(GroupsDialog.JOIN) },
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(1f).testTag(TestTags.GROUPS_JOIN_BUTTON),
                ) { Text("Join with a code") }
            }
            GroupList(state, onRetry = viewModel::refresh, onOpenGroup = onOpenGroup)
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
private fun GroupList(state: GroupsUiState, onRetry: () -> Unit, onOpenGroup: (String) -> Unit) {
    when {
        state.loading -> CircularProgressIndicator()
        state.error != null -> Column {
            Text(state.error, color = MaterialTheme.colorScheme.error)
            TextButton(onClick = onRetry) { Text("Try again") }
        }
        state.groups.isEmpty() -> Text(
            "You're not in a group yet. Create one, or join a friend's with their invite code.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.testTag(TestTags.GROUPS_EMPTY),
        )
        else -> state.groups.forEach { group -> GroupCard(group, onClick = { onOpenGroup(group.id) }) }
    }
}

@Composable
private fun GroupCard(group: GroupSummary, onClick: () -> Unit) {
    BrandCard(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag(TestTags.GROUP_CARD)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(group.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = countText(group.memberCount, "member") + if (group.myRole == ROLE_OWNER) " · You own this group" else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
