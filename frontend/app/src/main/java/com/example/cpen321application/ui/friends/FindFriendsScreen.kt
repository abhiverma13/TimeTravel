package com.example.cpen321application.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.TestTags

/** Find friends by name or email, and add them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FindFriendsScreen(viewModel: FindFriendsViewModel, onBack: () -> Unit, onOpenTraveller: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Find friends") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { SearchRow(state.query, state.searching, viewModel::onQueryChange, viewModel::search) }
            state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
            val results = state.results
            when {
                state.searching -> item { CircularProgressIndicator() }
                results == null -> item { Hint("Search by name, or by someone's exact email address.") }
                results.isEmpty() -> item { Hint("No travellers match \"${state.searchedFor}\".") }
                else -> items(results, key = { it.id }) { traveller ->
                    TravellerRow(
                        traveller = traveller,
                        busy = traveller.id in state.busyIds,
                        onOpen = { onOpenTraveller(traveller.id) },
                        onAction = { action -> viewModel.act(traveller, action) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchRow(query: String, searching: Boolean, onQueryChange: (String) -> Unit, onSearch: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            label = { Text("Name or email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f).testTag(TestTags.FRIEND_SEARCH_FIELD),
        )
        Button(onClick = onSearch, enabled = !searching, shape = MaterialTheme.shapes.small) { Text("Search") }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
}
