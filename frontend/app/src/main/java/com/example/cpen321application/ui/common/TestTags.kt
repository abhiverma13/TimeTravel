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
    const val STOP_ACTIONS_BUTTON = "stopActionsButton"
    const val STOP_ACTION_VETO = "stopActionVeto"
    const val STOP_ACTION_LOCK = "stopActionLock"
    const val STOP_ACTION_MOVE_EARLIER = "stopActionMoveEarlier"
    const val STOP_ACTION_MOVE_LATER = "stopActionMoveLater"
    const val STOP_ACTION_REMOVE = "stopActionRemove"
    const val STOP_LOCKED = "stopLocked"
    const val DAY_REPLAN_BUTTON = "dayReplanButton"
    const val LIVE_STATUS = "liveStatus"

    const val HOME_GROUPS = "homeGroups"
    const val GROUPS_CREATE_BUTTON = "groupsCreateButton"
    const val GROUPS_JOIN_BUTTON = "groupsJoinButton"
    const val GROUPS_EMPTY = "groupsEmpty"
    const val GROUP_CARD = "groupCard"
    const val GROUP_NAME_FIELD = "groupNameField"
    const val GROUP_CODE_FIELD = "groupCodeField"
    const val GROUP_DIALOG_CONFIRM = "groupDialogConfirm"
    const val GROUP_DIALOG_ERROR = "groupDialogError"
    const val GROUP_INVITE_CODE = "groupInviteCode"
    const val GROUP_PLAN_TRIP = "groupPlanTrip"
    const val GROUP_TRIP = "groupTrip"
    const val GROUP_MEMBER = "groupMember"
    const val GROUP_SAVE_INTERESTS = "groupSaveInterests"
    const val GROUP_LEAVE_BUTTON = "groupLeaveButton"
    const val GROUP_DELETE_BUTTON = "groupDeleteButton"
    const val CONFIRM_BUTTON = "confirmButton"
    const val TRIP_GROUP_NOTE = "tripGroupNote"

    fun ratingStar(stars: Int): String = "ratingStar$stars"
}
