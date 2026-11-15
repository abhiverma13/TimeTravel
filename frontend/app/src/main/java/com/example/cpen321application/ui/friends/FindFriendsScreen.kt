package com.example.cpen321application.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.Neo
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.neoField
import com.example.cpen321application.ui.common.neoFieldColors
import com.example.cpen321application.ui.theme.Blue

/** Find friends by name or email, and add them. */
@Composable
fun FindFriendsScreen(viewModel: FindFriendsViewModel, onBack: () -> Unit, onOpenTraveller: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { NeoTopBar(title = "Find friends", onBack = onBack) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { SearchRow(state.query, state.searching, viewModel::onQueryChange, viewModel::search) }
            state.error?.let { error -> item { ErrorNote(error) } }
            val results = state.results
            when {
                state.searching -> item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { NeoLoader() } }
                results == null -> item { EmptyNote("Search by name, or by someone's exact email address.") }
                results.isEmpty() -> item { EmptyNote("No travellers match \"${state.searchedFor}\".") }
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
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        TextField(
            value = query,
            onValueChange = onQueryChange,
            label = { Text("Name or email") },
            singleLine = true,
            shape = Neo.FieldShape,
            colors = neoFieldColors(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f).neoField().testTag(TestTags.FRIEND_SEARCH_FIELD),
        )
        NeoButton("Search", onClick = onSearch, enabled = !searching, color = Blue, modifier = Modifier.height(56.dp))
    }
}
