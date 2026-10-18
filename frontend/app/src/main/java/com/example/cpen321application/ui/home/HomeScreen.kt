package com.example.cpen321application.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.UserProfile
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.Wordmark
import com.example.cpen321application.ui.common.interestLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(user: UserProfile, onExplore: () -> Unit, onEditProfile: () -> Unit, onSignOut: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Wordmark(style = MaterialTheme.typography.titleLarge) },
                actions = {
                    TextButton(onClick = onSignOut, modifier = Modifier.testTag(TestTags.SIGN_OUT_BUTTON)) {
                        Text("Sign out")
                    }
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Hi, ${user.name.substringBefore(' ')}", style = MaterialTheme.typography.headlineMedium)
            HomeActionCard(
                title = "Explore & review",
                subtitle = "Browse a city's best-rated activities, and rate and tag the ones you have done.",
                onClick = onExplore,
                modifier = Modifier.testTag(TestTags.HOME_EXPLORE),
            )
            ProfileCard(user = user, onEdit = onEditProfile)
        }
    }
}

// A feature box like the presentation's: cream card, serif title, green bar along the bottom.
@Composable
private fun HomeActionCard(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BrandCard(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium)
        }
        Box(modifier = Modifier.fillMaxWidth().height(5.dp).background(MaterialTheme.colorScheme.secondary))
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
