package com.example.cpen321application.ui

import android.net.Uri
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.cpen321application.ui.common.FullScreenLoading
import com.example.cpen321application.ui.common.appViewModel
import com.example.cpen321application.ui.explore.ExploreScreen
import com.example.cpen321application.ui.explore.ExploreViewModel
import com.example.cpen321application.ui.groups.GroupDetailActions
import com.example.cpen321application.ui.groups.GroupDetailScreen
import com.example.cpen321application.ui.groups.GroupDetailViewModel
import com.example.cpen321application.ui.groups.GroupsScreen
import com.example.cpen321application.ui.groups.GroupsViewModel
import com.example.cpen321application.ui.home.HomeActions
import com.example.cpen321application.ui.home.HomeScreen
import com.example.cpen321application.ui.home.HomeViewModel
import com.example.cpen321application.ui.home.ProfileDialog
import com.example.cpen321application.ui.itinerary.ItineraryScreen
import com.example.cpen321application.ui.itinerary.ItineraryViewModel
import com.example.cpen321application.ui.signin.SignInScreen
import com.example.cpen321application.ui.trip.TripBuilderScreen
import com.example.cpen321application.ui.trip.TripBuilderViewModel
import com.example.cpen321application.ui.trip.TripGroup

private object Routes {
    const val HOME = "home"
    const val EXPLORE = "explore"
    const val GROUPS = "groups"
    const val GROUP_ID = "groupId"
    const val GROUP_NAME = "groupName"
    const val GROUP = "group/{$GROUP_ID}"
    const val TRIP_BUILDER = "tripBuilder?$GROUP_ID={$GROUP_ID}&$GROUP_NAME={$GROUP_NAME}"
    const val ITINERARY_ID = "itineraryId"
    const val ITINERARY = "itinerary/{$ITINERARY_ID}"

    fun itinerary(itineraryId: String) = "itinerary/$itineraryId"

    fun group(groupId: String) = "group/$groupId"

    fun tripBuilder(group: TripGroup? = null) =
        if (group == null) "tripBuilder" else "tripBuilder?$GROUP_ID=${group.id}&$GROUP_NAME=${Uri.encode(group.name)}"
}

// Used to prefill searches until the traveller sets a home city.
private const val DEFAULT_CITY = "Vancouver"

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

@Composable
private fun SignedInScreens(session: SessionState.SignedIn, viewModel: SessionViewModel) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            val home = appViewModel { HomeViewModel(it.repository) }
            val recentTrips by home.recentTrips.collectAsState()
            LaunchedEffect(Unit) { home.refresh() }
            HomeScreen(
                user = session.user,
                recentTrips = recentTrips,
                actions = HomeActions(
                    onPlanTrip = { navController.navigate(Routes.tripBuilder()) },
                    onExplore = { navController.navigate(Routes.EXPLORE) },
                    onGroups = { navController.navigate(Routes.GROUPS) },
                    onOpenItinerary = { navController.navigate(Routes.itinerary(it)) },
                    onEditProfile = viewModel::editProfile,
                    onSignOut = viewModel::signOut,
                ),
            )
        }
        tripScreens(navController, session)
        groupScreens(navController, session)
        composable(Routes.EXPLORE) {
            val startCity = session.user.homeCity.ifBlank { DEFAULT_CITY }
            ExploreScreen(
                viewModel = appViewModel { ExploreViewModel(it.repository, startCity) },
                onBack = navController::popBackStack,
            )
        }
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
            viewModel = appViewModel(key = itineraryId) { ItineraryViewModel(it.repository, it.groups, itineraryId, session.user.id) },
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
            viewModel = appViewModel(key = "group-$groupId") { GroupDetailViewModel(it.groups, it.repository, groupId, session.user.id) },
            actions = GroupDetailActions(
                onBack = navController::popBackStack,
                onPlanTrip = { id, name -> navController.navigate(Routes.tripBuilder(TripGroup(id, name))) },
                onOpenItinerary = { navController.navigate(Routes.itinerary(it)) },
            ),
        )
    }
}
