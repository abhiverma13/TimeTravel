package com.example.cpen321application.ui.common

/** Stable handles for the Compose end-to-end tests in androidTest/e2e. */
object TestTags {
    const val SIGN_IN_BUTTON = "signInButton"
    const val SIGN_OUT_BUTTON = "signOutButton"

    const val PROFILE_CARD = "profileCard"
    const val PROFILE_EDIT_BUTTON = "profileEditButton"
    const val PROFILE_CITY_FIELD = "profileCityField"
    const val PROFILE_SAVE_BUTTON = "profileSaveButton"

    const val HOME_EXPLORE = "homeExplore"

    const val EXPLORE_CITY_FIELD = "exploreCityField"
    const val EXPLORE_SEARCH_BUTTON = "exploreSearchButton"
    const val EXPLORE_ERROR = "exploreError"
    const val EXPLORE_EMPTY = "exploreEmpty"
    const val ACTIVITY_CARD = "activityCard"
    const val RATE_BUTTON = "rateButton"
    const val SUBMIT_RATING_BUTTON = "submitRatingButton"

    const val HOME_PLAN_TRIP = "homePlanTrip"
    const val RECENT_TRIP = "recentTrip"

    const val TRIP_CITY_FIELD = "tripCityField"
    const val TRIP_DATES_BUTTON = "tripDatesButton"
    const val TRIP_LODGING_FIELD = "tripLodgingField"
    const val TRIP_ERROR = "tripError"
    const val GENERATE_BUTTON = "generateButton"

    const val ITINERARY_DAY = "itineraryDay"
    const val ITINERARY_STOP = "itineraryStop"
    const val ITINERARY_WARNING = "itineraryWarning"

    fun ratingStar(stars: Int): String = "ratingStar$stars"
}
