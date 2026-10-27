package com.example.cpen321application.ui.explore

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.cpen321application.data.TravelActivity
import com.example.cpen321application.ui.common.BrandCard
import com.example.cpen321application.ui.common.INTEREST_LABELS
import com.example.cpen321application.ui.common.SectionLabel
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.communityTagsText
import com.example.cpen321application.ui.common.countText
import com.example.cpen321application.ui.common.durationText
import com.example.cpen321application.ui.common.interestLabel
import com.example.cpen321application.ui.common.openingTodayText
import com.example.cpen321application.ui.common.scoreText
import com.example.cpen321application.ui.map.LOCATION_PERMISSIONS
import com.example.cpen321application.ui.map.hasLocationPermission
import com.example.cpen321application.ui.map.requestCurrentLocation

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(viewModel: ExploreViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var permitted by remember { mutableStateOf(hasLocationPermission(context)) }
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        permitted = results.values.any { it }
    }
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(state.confirmation) {
        val confirmation = state.confirmation
        if (confirmation != null) {
            snackbarHostState.showSnackbar(confirmation)
            viewModel.confirmationShown()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Explore & review") })
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { CitySearch(state.city, state.loading, viewModel::onCityChange, viewModel::search) }
            item { InterestFilter(state.interest, viewModel::onInterestSelected) }
            exploreResults(state, CardActions(onRate = viewModel::startRating, onAdd = viewModel::startAddToTrip, onReviews = viewModel::openReviews))
        }
    }

    state.adding?.let { adding ->
        AddToTripDialog(adding, viewModel::chooseTrip, viewModel::addToDay, viewModel::dismissAddToTrip)
    }

    val rating = state.rating
    if (rating != null) {
        RateActivityDialog(
            activity = rating,
            submitting = state.submittingReview,
            error = state.reviewError,
            onSubmit = { stars, comment, tags ->
                viewModel.submitReview(stars, comment, tags) { done ->
                    if (hasLocationPermission(context)) requestCurrentLocation(context, done) else done(null)
                }
            },
            onDismiss = viewModel::dismissRating,
            onAllowLocation = if (permitted) null else ({ askPermission.launch(LOCATION_PERMISSIONS) }),
        )
    }
    state.reviewsOf?.let { activity -> ReviewsDialog(activity, state.reviews, onDismiss = viewModel::closeReviews) }
}

/** What an activity card can ask for. */
private class CardActions(val onRate: (TravelActivity) -> Unit, val onAdd: (TravelActivity) -> Unit, val onReviews: (TravelActivity) -> Unit)

private fun LazyListScope.exploreResults(state: ExploreUiState, actions: CardActions) {
    when {
        state.loading -> item {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        state.error != null -> item {
            Text(state.error, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag(TestTags.EXPLORE_ERROR))
        }
        state.searchedCity == null -> item {
            Text("Search a city to see its best-rated activities.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        state.activities.isEmpty() -> item {
            Text("No activities found for ${state.searchedCity}.", modifier = Modifier.testTag(TestTags.EXPLORE_EMPTY))
        }
        else -> {
            item { SectionLabel("Best-rated in ${state.searchedCity}") }
            items(state.activities, key = { it.id }) { activity ->
                ActivityCard(activity = activity, actions = actions)
            }
        }
    }
}

@Composable
private fun CitySearch(city: String, loading: Boolean, onCityChange: (String) -> Unit, onSearch: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = city,
            onValueChange = onCityChange,
            label = { Text("City") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f).testTag(TestTags.EXPLORE_CITY_FIELD),
        )
        Button(
            onClick = onSearch,
            enabled = !loading,
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.height(56.dp).testTag(TestTags.EXPLORE_SEARCH_BUTTON),
        ) {
            Text("Search")
        }
    }
}

@Composable
private fun InterestFilter(selected: String?, onSelect: (String?) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text("All") })
        }
        items(INTEREST_LABELS) { (tag, label) ->
            FilterChip(selected = selected == tag, onClick = { onSelect(tag) }, label = { Text(label) })
        }
    }
}

@Composable
private fun ActivityCard(activity: TravelActivity, actions: CardActions) {
    BrandCard(modifier = Modifier.fillMaxWidth().testTag(TestTags.ACTIVITY_CARD)) {
        Column(
            modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 4.dp, bottom = 4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(activity.name, style = MaterialTheme.typography.titleMedium)
            SectionLabel(activity.interests.joinToString(" · ") { interestLabel(it) })
            RatingLine(activity)
            val tags = communityTagsText(activity.communityTags)
            if (tags.isNotEmpty()) {
                Text(tags, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            }
            Text(
                text = openingTodayText(activity.openingHours),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { actions.onReviews(activity) }, modifier = Modifier.testTag(TestTags.REVIEWS_BUTTON)) { Text("Reviews") }
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = { actions.onAdd(activity) }, modifier = Modifier.testTag(TestTags.ADD_TO_TRIP_BUTTON)) { Text("Add to trip") }
                TextButton(onClick = { actions.onRate(activity) }, modifier = Modifier.testTag(TestTags.RATE_BUTTON)) { Text("Rate") }
            }
        }
    }
}

// "★ 4.7  318 ratings · 2 reviews · 2 h", styled like the presentation's activity cards.
@Composable
private fun RatingLine(activity: TravelActivity) {
    val gold = MaterialTheme.colorScheme.tertiary
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = gold, fontWeight = FontWeight.Bold)) {
                append("★ ${scoreText(activity.communityScore)}")
            }
            withStyle(SpanStyle(color = muted)) {
                append("  ${countText(activity.googleRatingCount, "rating")}")
                append(" · ${countText(activity.reviewCount, "review")}")
                if (activity.verifiedReviewCount > 0) {
                    append(" (${activity.verifiedReviewCount} verified)")
                }
                append(" · ${durationText(activity.durationMinutes)}")
            }
        },
        style = MaterialTheme.typography.bodyMedium,
    )
}
