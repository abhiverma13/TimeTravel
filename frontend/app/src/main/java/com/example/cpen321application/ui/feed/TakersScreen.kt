package com.example.cpen321application.ui.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.data.PostRepository
import com.example.cpen321application.data.Taker
import com.example.cpen321application.ui.common.EmptyNote
import com.example.cpen321application.ui.common.ErrorNote
import com.example.cpen321application.ui.common.NeoButton
import com.example.cpen321application.ui.common.NeoCard
import com.example.cpen321application.ui.common.NeoLoader
import com.example.cpen321application.ui.common.NeoTopBar
import com.example.cpen321application.ui.common.SquareAvatar
import com.example.cpen321application.ui.common.Sticker
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.theme.Card
import com.example.cpen321application.ui.theme.Ink
import com.example.cpen321application.ui.theme.Lime
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val PLANNER_TILT = -3f

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
@Composable
fun TakersScreen(viewModel: TakersViewModel, onBack: () -> Unit, onOpenTraveller: (String) -> Unit) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { NeoTopBar(title = "Who took this trip", onBack = onBack) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when {
                state.loading -> item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { NeoLoader() } }
                state.error != null -> item {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        ErrorNote(state.error.orEmpty())
                        NeoButton("Try again", onClick = viewModel::load, color = Card, compact = true)
                    }
                }
                else -> {
                    items(state.takers, key = { it.postId }) { taker -> TakerCard(taker, onOpenTraveller) }
                    if (state.hiddenCount > 0) {
                        item { EmptyNote("and ${countText(state.hiddenCount, "private traveller")}") }
                    }
                }
            }
        }
    }
}

// A traveller who took the trip: their square, name, a lime sticker for the planner, their stars and words.
@Composable
private fun TakerCard(taker: Taker, onOpenTraveller: (String) -> Unit) {
    NeoCard(onClick = { onOpenTraveller(taker.traveller.id) }, modifier = Modifier.fillMaxWidth().testTag(TestTags.TAKER_ROW)) {
        Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            SquareAvatar(taker.traveller.name, size = 48.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(taker.traveller.name, style = MaterialTheme.typography.titleLarge, color = Ink)
                if (taker.planner) {
                    Sticker("Planned this trip", color = Lime, tilt = PLANNER_TILT)
                }
                RatingStars(taker.rating)
                if (taker.caption.isNotBlank()) {
                    Text(taker.caption, style = MaterialTheme.typography.bodyMedium, color = Ink)
                }
            }
        }
    }
}
