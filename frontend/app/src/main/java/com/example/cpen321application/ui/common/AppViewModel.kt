package com.example.cpen321application.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.cpen321application.TimeTravelApplication
import com.example.cpen321application.data.TimeTravelRepository

/** A ViewModel scoped to the current screen, built with the app's [TimeTravelRepository]. */
@Composable
inline fun <reified T : ViewModel> appViewModel(
    key: String? = null,
    crossinline create: (TimeTravelRepository) -> T,
): T {
    val application = LocalContext.current.applicationContext as TimeTravelApplication
    return viewModel(key = key, factory = viewModelFactory { initializer { create(application.container.repository) } })
}
