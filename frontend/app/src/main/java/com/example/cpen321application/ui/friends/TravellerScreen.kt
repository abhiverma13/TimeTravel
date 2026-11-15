package com.example.cpen321application.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.FRIENDSHIP_FRIENDS
import com.example.cpen321application.data.FRIENDSHIP_SELF
import com.example.cpen321application.data.Traveller
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.SectionHeader
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.feed.PostCard
import com.example.cpen321application.ui.feed.PostCardActions
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.InkSoft
import com.example.cpen321application.ui.theme.Pink

/** Another traveller's profile: who they are, how many friends they have, and your friendship with them. */
@Composable
fun TravellerScreen(viewModel: TravellerViewModel, onBack: () -> Unit, onOpenPost: (String) -> Unit, onOpenTakers: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { NeoTopBar(title = "Traveller", onBack = onBack) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val traveller = state.traveller
            when {
                state.loading && traveller == null -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { NeoLoader() }
                traveller == null -> {
                    ErrorNote(state.error ?: "Traveller not found")
                    NeoButton("Try again", onClick = viewModel::load, color = Card, compact = true)
                }
                else -> TravellerCard(traveller, state.busy, viewModel::act)
            }
            state.actionError?.let { ErrorNote(it) }
            if (state.posts.isNotEmpty()) {
                SectionHeader("Shared trips", Pink, modifier = Modifier.padding(top = 8.dp))
                state.posts.forEach { post ->
                    val actions = PostCardActions(
                        onOpen = { onOpenPost(post.id) },
                        onOpenAuthor = {},
                        onLike = { viewModel.toggleLike(post) },
                        onOpenTakers = onOpenTakers,
                    )
                    PostCard(post, actions)
                }
            }
        }
    }
}

@Composable
private fun TravellerCard(traveller: Traveller, busy: Boolean, onAction: (FriendAction) -> Unit) {
    NeoCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.TRAVELLER_PROFILE)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                SquareAvatar(traveller.name, size = 64.dp)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(traveller.name, style = MaterialTheme.typography.headlineMedium, color = Ink)
                    Text(travellerSubtitle(traveller), style = MaterialTheme.typography.titleSmall, color = Ink)
                }
            }
            Text(
                countText(traveller.friendCount, "friend") + if (traveller.friendship == FRIENDSHIP_FRIENDS) " · You are friends" else "",
                style = MaterialTheme.typography.labelMedium,
                color = InkSoft,
            )
            if (traveller.isPrivate && traveller.friendship !in setOf(FRIENDSHIP_FRIENDS, FRIENDSHIP_SELF)) {
                Text(
                    "This account is private: only their friends see their details and posts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkSoft,
                )
            }
            FriendshipActions(traveller.friendship, busy, onAction)
        }
    }
}
