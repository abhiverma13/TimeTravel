package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.data.Taker
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TakersUiState(
    val loading: Boolean = true,
    val takers: List<Taker> = emptyList(),
    val hiddenCount: Int = 0,
    val error: String? = null,
)

/** Everyone who took a shared trip, planner first, with their rating and caption. */
class TakersViewModel(private val posts: PostRepository, private val postId: String) : ViewModel() {
    private val mutableState = MutableStateFlow(TakersUiState())
    val state: StateFlow<TakersUiState> = mutableState.asStateFlow()

    init {
        load()
    }

    fun load() {
        mutableState.value = TakersUiState()
        viewModelScope.launch {
            mutableState.value = posts.takers(postId).fold(
                onSuccess = { TakersUiState(loading = false, takers = it.takers, hiddenCount = it.hiddenCount) },
                onFailure = { TakersUiState(loading = false, error = it.message) },
            )
        }
    }
}

/** Who took this trip: the travellers you may see, each opening their profile; private strangers are only counted. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TakersScreen(viewModel: TakersViewModel, onBack: () -> Unit, onOpenTraveller: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Who took this trip") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                state.loading -> item { CircularProgressIndicator() }
                state.error != null -> item {
                    Column {
                        Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                        TextButton(onClick = viewModel::load) { Text("Try again") }
                    }
                }
                else -> {
                    items(state.takers, key = { it.postId }) { taker -> TakerCard(taker, onOpenTraveller) }
                    if (state.hiddenCount > 0) {
                        item {
                            Text(
                                "and ${countText(state.hiddenCount, "private traveller")}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TakerCard(taker: Taker, onOpenTraveller: (String) -> Unit) {
    BrandCard(onClick = { onOpenTraveller(taker.traveller.id) }, modifier = Modifier.fillMaxWidth().testTag(TestTags.TAKER_ROW)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(taker.traveller.name, style = MaterialTheme.typography.titleMedium)
            if (taker.planner) {
                Text("Planned this trip", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            RatingStars(taker.rating)
            if (taker.caption.isNotBlank()) {
                Text(taker.caption, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
