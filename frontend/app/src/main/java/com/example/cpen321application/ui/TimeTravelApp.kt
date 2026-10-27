package com.example.cpen321application.ui

import android.net.Uri
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.cpen321application.ui.common.FullScreenLoading
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.appViewModel
import com.example.cpen321application.ui.explore.ExploreScreen
import com.example.cpen321application.ui.explore.ExploreViewModel
import com.example.cpen321application.ui.feed.FeedScreen
import com.example.cpen321application.ui.feed.FeedViewModel
import com.example.cpen321application.ui.feed.PostNavigation
import com.example.cpen321application.ui.feed.PostScreen
import com.example.cpen321application.ui.feed.PostViewModel
import com.example.cpen321application.ui.feed.SharePostViewModel
import com.example.cpen321application.ui.friends.FindFriendsScreen
import com.example.cpen321application.ui.friends.FindFriendsViewModel
import com.example.cpen321application.ui.friends.TravellerScreen
import com.example.cpen321application.ui.friends.TravellerViewModel
import com.example.cpen321application.ui.groups.GroupDetailActions
import com.example.cpen321application.ui.groups.GroupDetailScreen
import com.example.cpen321application.ui.groups.GroupDetailViewModel
import com.example.cpen321application.ui.groups.GroupsScreen
import com.example.cpen321application.ui.groups.GroupsViewModel
import com.example.cpen321application.ui.home.HomeActions
import com.example.cpen321application.ui.home.HomeScreen
import com.example.cpen321application.ui.home.HomeViewModel
import com.example.cpen321application.ui.home.ProfileDialog
import com.example.cpen321application.ui.itinerary.ItineraryDependencies
import com.example.cpen321application.ui.itinerary.ItineraryScreen
import com.example.cpen321application.ui.itinerary.ItineraryViewModel
import com.example.cpen321application.ui.map.MapScreen
import com.example.cpen321application.ui.map.MapViewModel
import com.example.cpen321application.ui.nearby.NearbyScreen
import com.example.cpen321application.ui.nearby.NearbyViewModel
import com.example.cpen321application.ui.profile.ProfileActions
import com.example.cpen321application.ui.profile.ProfileScreen
import com.example.cpen321application.ui.profile.ProfileViewModel
import com.example.cpen321application.ui.signin.SignInScreen
import com.example.cpen321application.ui.trip.TripBuilderScreen
import com.example.cpen321application.ui.trip.TripBuilderViewModel
import com.example.cpen321application.ui.trip.TripGroup

private object Routes {
    const val HOME = "home"
    const val EXPLORE = "explore"
    const val PROFILE = "profile"
    const val FEED = "feed"
    const val NEARBY = "nearby"
    const val POST_ID = "postId"
    const val POST = "post/{$POST_ID}"
    const val FIND_FRIENDS = "findFriends"
    const val USER_ID = "userId"
    const val TRAVELLER = "traveller/{$USER_ID}"
    const val GROUPS = "groups"
    const val GROUP_ID = "groupId"
    const val GROUP_NAME = "groupName"
    const val GROUP = "group/{$GROUP_ID}"
    const val TRIP_BUILDER = "tripBuilder?$GROUP_ID={$GROUP_ID}&$GROUP_NAME={$GROUP_NAME}"
    const val ITINERARY_ID = "itineraryId"
    const val ITINERARY = "itinerary/{$ITINERARY_ID}"
    const val ITINERARY_MAP = "itinerary/{$ITINERARY_ID}/map"

    fun itinerary(itineraryId: String) = "itinerary/$itineraryId"

    fun itineraryMap(itineraryId: String) = "itinerary/$itineraryId/map"

    fun group(groupId: String) = "group/$groupId"

    fun traveller(userId: String) = "traveller/$userId"

    fun post(postId: String) = "post/$postId"

    fun tripBuilder(group: TripGroup? = null) =
        if (group == null) "tripBuilder" else "tripBuilder?$GROUP_ID=${group.id}&$GROUP_NAME=${Uri.encode(group.name)}"
}

// Used to prefill searches until the traveller sets a home city.
private const val DEFAULT_CITY = "Vancouver"

/** A destination in the bottom navigation bar. */
private class Tab(val route: String, val label: String, val icon: ImageVector, val testTag: String)

private val TABS = listOf(
    Tab(Routes.HOME, "Trips", Icons.Filled.Home, TestTags.TAB_TRIPS),
    Tab(Routes.EXPLORE, "Explore", Icons.Filled.Search, TestTags.TAB_EXPLORE),
    Tab(Routes.NEARBY, "Nearby", Icons.Filled.LocationOn, TestTags.TAB_NEARBY),
    Tab(Routes.FEED, "Feed", Icons.AutoMirrored.Filled.List, TestTags.TAB_FEED),
    Tab(Routes.PROFILE, "Profile", Icons.Filled.Person, TestTags.TAB_PROFILE),
)

/** Shows sign-in until there is a session, then the signed-in screens. */
@Composable
fun TimeTravelApp() {
    val session = appViewModel { SessionViewModel(it.repository) }
    val state by session.state.collectAsState()
    val activity = LocalActivity.current

    when (val current = state) {
        SessionState.Checking -> FullScreenLoading()
        is SessionState.SignedOut -> SignInScreen(
            signingIn = current.signingIn,
            message = current.message,
            signInConfigured = session.isSignInConfigured,
            onSignIn = { activity?.let(session::signIn) },
        )
        is SessionState.SignedIn -> {
            SignedInScreens(session = current, viewModel = session)
            if (current.editingProfile) {
                ProfileDialog(
                    user = current.user,
                    saving = current.savingProfile,
                    error = current.profileError,
                    onSave = session::saveProfile,
                    onDismiss = session::cancelProfileEdit,
                )
            }
        }
    }
}

// The tabs show the bottom bar; screens opened from them cover it until the traveller goes back.
@Composable
private fun SignedInScreens(session: SessionState.SignedIn, viewModel: SessionViewModel) {
    val navController = rememberNavController()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    Scaffold(
        bottomBar = {
            if (TABS.any { it.route == currentRoute }) {
                TabBar(currentRoute) { route ->
                    navController.navigate(route) {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(innerPadding).consumeWindowInsets(innerPadding),
        ) {
            tabScreens(navController, session, viewModel)
            tripScreens(navController, session)
            groupScreens(navController, session)
            friendScreens(navController)
            feedScreens(navController)
        }
    }
}

@Composable
private fun TabBar(currentRoute: String?, onSelect: (String) -> Unit) {
    NavigationBar {
        TABS.forEach { tab ->
            NavigationBarItem(
                selected = tab.route == currentRoute,
                onClick = { onSelect(tab.route) },
                icon = { Icon(tab.icon, contentDescription = null) },
                label = { Text(tab.label) },
                modifier = Modifier.testTag(tab.testTag),
            )
        }
    }
}

private fun NavGraphBuilder.tabScreens(navController: NavHostController, session: SessionState.SignedIn, viewModel: SessionViewModel) {
    composable(Routes.HOME) {
        val home = appViewModel { HomeViewModel(it.repository) }
        val recentTrips by home.recentTrips.collectAsState()
        LaunchedEffect(Unit) { home.refresh() }
        HomeScreen(
            user = session.user,
            recentTrips = recentTrips,
            actions = HomeActions(
                onPlanTrip = { navController.navigate(Routes.tripBuilder()) },
                onGroups = { navController.navigate(Routes.GROUPS) },
                onOpenItinerary = { navController.navigate(Routes.itinerary(it)) },
            ),
        )
    }
    composable(Routes.EXPLORE) {
        val startCity = session.user.homeCity.ifBlank { DEFAULT_CITY }
        ExploreScreen(viewModel = appViewModel { ExploreViewModel(it.repository, startCity) })
    }
    composable(Routes.NEARBY) {
        NearbyScreen(viewModel = appViewModel { NearbyViewModel(it.nearby) })
    }
    composable(Routes.PROFILE) {
        ProfileScreen(
            user = session.user,
            viewModel = appViewModel { ProfileViewModel(it.friends) },
            actions = ProfileActions(
                onEditProfile = viewModel::editProfile,
                onSignOut = viewModel::signOut,
                onFindFriends = { navController.navigate(Routes.FIND_FRIENDS) },
                onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
            ),
        )
    }
}

private fun NavGraphBuilder.friendScreens(navController: NavHostController) {
    composable(Routes.FIND_FRIENDS) {
        FindFriendsScreen(
            viewModel = appViewModel { FindFriendsViewModel(it.friends) },
            onBack = navController::popBackStack,
            onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
        )
    }
    composable(Routes.TRAVELLER) { entry ->
        val userId = entry.arguments?.getString(Routes.USER_ID).orEmpty()
        TravellerScreen(
            viewModel = appViewModel(key = "traveller-$userId") { TravellerViewModel(it.friends, it.posts, userId) },
            onBack = navController::popBackStack,
            onOpenPost = { navController.navigate(Routes.post(it)) },
        )
    }
}

private fun NavGraphBuilder.feedScreens(navController: NavHostController) {
    composable(Routes.FEED) {
        FeedScreen(
            viewModel = appViewModel { FeedViewModel(it.posts) },
            onOpenPost = { navController.navigate(Routes.post(it)) },
            onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
        )
    }
    composable(Routes.POST) { entry ->
        val postId = entry.arguments?.getString(Routes.POST_ID).orEmpty()
        PostScreen(
            viewModel = appViewModel(key = "post-$postId") { PostViewModel(it.posts, postId) },
            navigation = PostNavigation(
                onBack = navController::popBackStack,
                onOpenTraveller = { navController.navigate(Routes.traveller(it)) },
                onOpenItinerary = { navController.navigate(Routes.itinerary(it)) },
            ),
        )
    }
}

private fun NavGraphBuilder.tripScreens(navController: NavHostController, session: SessionState.SignedIn) {
    composable(
        Routes.TRIP_BUILDER,
        arguments = listOf(
            navArgument(Routes.GROUP_ID) { type = NavType.StringType; nullable = true },
            navArgument(Routes.GROUP_NAME) { type = NavType.StringType; nullable = true },
        ),
    ) { entry ->
        val city = session.user.homeCity.ifBlank { DEFAULT_CITY }
        val groupId = entry.arguments?.getString(Routes.GROUP_ID)
        val group = groupId?.let { TripGroup(it, entry.arguments?.getString(Routes.GROUP_NAME).orEmpty()) }
        TripBuilderScreen(
            viewModel = appViewModel(key = "trip-$groupId") { TripBuilderViewModel(it.repository, city, session.user.interests, group) },
            onBack = navController::popBackStack,
            onItineraryReady = { itineraryId ->
                navController.navigate(Routes.itinerary(itineraryId)) {
                    popUpTo(Routes.TRIP_BUILDER) { inclusive = true }
                }
            },
        )
    }
    composable(Routes.ITINERARY) { entry ->
        val itineraryId = entry.arguments?.getString(Routes.ITINERARY_ID).orEmpty()
        ItineraryScreen(
            viewModel = appViewModel(key = itineraryId) {
                ItineraryViewModel(ItineraryDependencies(it.repository, it.groups, it.liveItineraries, session.user.id), itineraryId)
            },
            share = appViewModel(key = "share-$itineraryId") { SharePostViewModel(it.posts, itineraryId) },
            onBack = navController::popBackStack,
            onOpenMap = { navController.navigate(Routes.itineraryMap(itineraryId)) },
        )
    }
    composable(Routes.ITINERARY_MAP) { entry ->
        val itineraryId = entry.arguments?.getString(Routes.ITINERARY_ID).orEmpty()
        MapScreen(
            viewModel = appViewModel(key = "map-$itineraryId") { MapViewModel(it.repository, it.liveItineraries, itineraryId) },
            onBack = navController::popBackStack,
        )
    }
}

private fun NavGraphBuilder.groupScreens(navController: NavHostController, session: SessionState.SignedIn) {
    composable(Routes.GROUPS) {
        GroupsScreen(
            viewModel = appViewModel { GroupsViewModel(it.groups) },
            onBack = navController::popBackStack,
            onOpenGroup = { groupId -> navController.navigate(Routes.group(groupId)) },
        )
    }
    composable(Routes.GROUP) { entry ->
        val groupId = entry.arguments?.getString(Routes.GROUP_ID).orEmpty()
        GroupDetailScreen(
            viewModel = appViewModel(key = "group-$groupId") { GroupDetailViewModel(it.groups, it.repository, it.nearby, groupId, session.user.id) },
            actions = GroupDetailActions(
                onBack = navController::popBackStack,
                onPlanTrip = { id, name -> navController.navigate(Routes.tripBuilder(TripGroup(id, name))) },
                onOpenItinerary = { navController.navigate(Routes.itinerary(it)) },
            ),
        )
    }
}
