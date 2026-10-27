package com.example.cpen321application.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.FRIENDSHIP_FRIENDS
import com.example.cpen321application.data.FRIENDSHIP_SELF
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText

/** Another traveller's profile: who they are, how many friends they have, and your friendship with them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TravellerScreen(viewModel: TravellerViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Traveller") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val traveller = state.traveller
            when {
                state.loading && traveller == null -> CircularProgressIndicator()
                traveller == null -> {
                    Text(state.error ?: "Traveller not found", color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = viewModel::load) { Text("Try again") }
                }
                else -> TravellerCard(traveller, state.busy, viewModel::act)
            }
            state.actionError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}

@Composable
private fun TravellerCard(traveller: Traveller, busy: Boolean, onAction: (FriendAction) -> Unit) {
    BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.TRAVELLER_PROFILE)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(traveller.name, style = MaterialTheme.typography.headlineSmall)
            Text(travellerSubtitle(traveller), style = MaterialTheme.typography.bodyMedium)
            Text(
                countText(traveller.friendCount, "friend") + if (traveller.friendship == FRIENDSHIP_FRIENDS) " · You are friends" else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (traveller.isPrivate && traveller.friendship !in setOf(FRIENDSHIP_FRIENDS, FRIENDSHIP_SELF)) {
                Text(
                    "This account is private: only their friends see their details and posts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            FriendshipActions(traveller.friendship, busy, onAction)
        }
    }
}
